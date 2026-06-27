package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.DowntimeRecordRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.DowntimeRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.DowntimeRecord;
import com.injectmes.entity.Machine;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.SysUser;
import com.injectmes.enums.DowntimeReason;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.DowntimeRecordMapper;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 停机记录服务
 */
@Service
public class DowntimeRecordService {

    private static final Set<DowntimeReason> PLANNED_REASONS = Set.of(
            DowntimeReason.MOLD_CHANGE,
            DowntimeReason.BREAK
    );

    @Autowired
    private DowntimeRecordMapper downtimeRecordMapper;

    @Autowired
    private MachineMapper machineMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 停机记录列表
     */
    public R<PageResponse<DowntimeRecordResponse>> list(PageRequest request, Long machineId, String reason,
                                                        String downtimeType, LocalDate startDate, LocalDate endDate) {
        Page<DowntimeRecord> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<DowntimeRecord> wrapper = new LambdaQueryWrapper<>();

        if (machineId != null) {
            wrapper.eq(DowntimeRecord::getMachineId, machineId);
        }
        if (StringUtils.hasText(reason)) {
            wrapper.eq(DowntimeRecord::getReason, normalizeReason(reason).name());
        }
        if (StringUtils.hasText(downtimeType)) {
            String normalizedType = downtimeType.trim().toUpperCase(Locale.ROOT);
            if ("PLAN".equals(normalizedType)) {
                wrapper.in(DowntimeRecord::getReason, plannedReasonCodes());
            } else if ("FAULT".equals(normalizedType)) {
                wrapper.notIn(DowntimeRecord::getReason, plannedReasonCodes());
            } else {
                throw new BusinessException("不支持的停机类型");
            }
        }
        if (startDate != null) {
            wrapper.ge(DowntimeRecord::getStartTime, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(DowntimeRecord::getStartTime, endDate.plusDays(1).atStartOfDay());
        }

        String keyword = request.getKeyword();
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w
                    .like(DowntimeRecord::getReason, keyword.trim())
                    .or().like(DowntimeRecord::getRemark, keyword.trim()));
        }

        wrapper.orderByDesc(DowntimeRecord::getCreatedAt)
                .orderByDesc(DowntimeRecord::getStartTime);

        Page<DowntimeRecord> result = downtimeRecordMapper.selectPage(page, wrapper);
        List<DowntimeRecordResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<DowntimeRecordResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());
        return R.ok(pageResponse);
    }

    /**
     * 创建停机记录
     */
    @Transactional
    public R<DowntimeRecordResponse> create(DowntimeRecordRequest request, Long operatorId) {
        validateMachine(request.getMachineId());
        validateProdOrder(request.getProdOrderId());
        DowntimeReason downtimeReason = normalizeReason(request.getReason());
        Integer durationMinutes = calculateDurationMinutes(request.getStartTime(), request.getEndTime());

        DowntimeRecord record = new DowntimeRecord();
        record.setMachineId(request.getMachineId());
        record.setProdOrderId(request.getProdOrderId());
        record.setReason(downtimeReason.name());
        record.setStartTime(request.getStartTime());
        record.setEndTime(request.getEndTime());
        record.setDurationMinutes(durationMinutes);
        record.setOperatorId(operatorId);
        record.setRemark(request.getRemark());
        record.setCreatedAt(LocalDateTime.now());
        downtimeRecordMapper.insert(record);

        return R.ok("创建成功", convertToResponse(record));
    }

    /**
     * 更新停机记录
     */
    @Transactional
    public R<DowntimeRecordResponse> update(Long id, DowntimeRecordRequest request, Long operatorId) {
        DowntimeRecord record = downtimeRecordMapper.selectById(id);
        if (record == null) {
            throw new BusinessException("停机记录不存在");
        }

        validateMachine(request.getMachineId());
        validateProdOrder(request.getProdOrderId());
        DowntimeReason downtimeReason = normalizeReason(request.getReason());
        Integer durationMinutes = calculateDurationMinutes(request.getStartTime(), request.getEndTime());

        record.setMachineId(request.getMachineId());
        record.setProdOrderId(request.getProdOrderId());
        record.setReason(downtimeReason.name());
        record.setStartTime(request.getStartTime());
        record.setEndTime(request.getEndTime());
        record.setDurationMinutes(durationMinutes);
        record.setOperatorId(operatorId != null ? operatorId : record.getOperatorId());
        record.setRemark(request.getRemark());
        downtimeRecordMapper.updateById(record);

        return R.ok("更新成功", convertToResponse(record));
    }

    /**
     * 删除停机记录
     */
    @Transactional
    public R<Void> delete(Long id) {
        DowntimeRecord record = downtimeRecordMapper.selectById(id);
        if (record == null) {
            throw new BusinessException("停机记录不存在");
        }
        downtimeRecordMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    private void validateMachine(Long machineId) {
        Machine machine = machineMapper.selectById(machineId);
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }
    }

    private void validateProdOrder(Long prodOrderId) {
        if (prodOrderId == null) {
            return;
        }
        ProdOrder prodOrder = prodOrderMapper.selectById(prodOrderId);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }
    }

    private DowntimeReason normalizeReason(String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("停机原因不能为空");
        }
        try {
            return DowntimeReason.valueOf(reason.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new BusinessException("不支持的停机原因");
        }
    }

    private Integer calculateDurationMinutes(LocalDateTime startTime, LocalDateTime endTime) {
        if (startTime == null || endTime == null) {
            return null;
        }
        if (endTime.isBefore(startTime)) {
            throw new BusinessException("停机结束时间不能早于开始时间");
        }
        long minutes = Duration.between(startTime, endTime).toMinutes();
        return (int) minutes;
    }

    private List<String> plannedReasonCodes() {
        return PLANNED_REASONS.stream()
                .map(Enum::name)
                .toList();
    }

    private DowntimeRecordResponse convertToResponse(DowntimeRecord record) {
        DowntimeRecordResponse response = new DowntimeRecordResponse();
        BeanUtils.copyProperties(record, response);
        response.setDowntimeType(resolveDowntimeType(record.getReason()));
        response.setReasonLabel(resolveReasonLabel(record.getReason()));

        if (record.getMachineId() != null) {
            Machine machine = machineMapper.selectById(record.getMachineId());
            if (machine != null) {
                response.setMachineName(machine.getName());
            }
        }

        if (record.getProdOrderId() != null) {
            ProdOrder prodOrder = prodOrderMapper.selectById(record.getProdOrderId());
            if (prodOrder != null) {
                response.setOrderNo(prodOrder.getOrderNo());
            }
        }

        if (record.getOperatorId() != null) {
            SysUser user = sysUserMapper.selectById(record.getOperatorId());
            if (user != null) {
                response.setOperatorName(user.getRealName());
            }
        }

        return response;
    }

    private String resolveDowntimeType(String reason) {
        if (!StringUtils.hasText(reason)) {
            return null;
        }
        try {
            DowntimeReason downtimeReason = DowntimeReason.valueOf(reason.trim().toUpperCase(Locale.ROOT));
            return PLANNED_REASONS.contains(downtimeReason) ? "PLAN" : "FAULT";
        } catch (IllegalArgumentException ex) {
            return "FAULT";
        }
    }

    private String resolveReasonLabel(String reason) {
        if (!StringUtils.hasText(reason)) {
            return "";
        }
        try {
            return DowntimeReason.valueOf(reason.trim().toUpperCase(Locale.ROOT)).getDescription();
        } catch (IllegalArgumentException ex) {
            return reason;
        }
    }
}
