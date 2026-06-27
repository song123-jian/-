package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.MoldMountRecordRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MoldMountRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.Machine;
import com.injectmes.entity.Mold;
import com.injectmes.entity.MoldMountRecord;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.SysUser;
import com.injectmes.enums.MountType;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.MoldMountRecordMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 模具上下模记录服务
 */
@Service
public class MoldMountRecordService {

    @Autowired
    private MoldMountRecordMapper moldMountRecordMapper;

    @Autowired
    private MoldMapper moldMapper;

    @Autowired
    private MachineMapper machineMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 分页查询上下模记录
     */
    public R<PageResponse<MoldMountRecordResponse>> list(PageRequest request, Long moldId, Long machineId,
                                                         String mountType, LocalDate startDate, LocalDate endDate) {
        Page<MoldMountRecord> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<MoldMountRecord> wrapper = new LambdaQueryWrapper<>();

        if (moldId != null) {
            wrapper.eq(MoldMountRecord::getMoldId, moldId);
        }
        if (machineId != null) {
            wrapper.eq(MoldMountRecord::getMachineId, machineId);
        }
        if (mountType != null && !mountType.trim().isEmpty()) {
            wrapper.eq(MoldMountRecord::getMountType, mountType);
        }
        if (startDate != null) {
            wrapper.ge(MoldMountRecord::getOperateTime, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(MoldMountRecord::getOperateTime, endDate.plusDays(1).atStartOfDay());
        }

        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w.like(MoldMountRecord::getRemark, keyword));
        }

        wrapper.orderByDesc(MoldMountRecord::getOperateTime);
        Page<MoldMountRecord> result = moldMountRecordMapper.selectPage(page, wrapper);

        List<MoldMountRecordResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<MoldMountRecordResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 新增上下模记录
     */
    @Transactional
    public R<MoldMountRecordResponse> create(MoldMountRecordRequest request) {
        Mold mold = moldMapper.selectById(request.getMoldId());
        if (mold == null) {
            throw new BusinessException("模具不存在");
        }

        Machine machine = machineMapper.selectById(request.getMachineId());
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }

        SysUser operator = sysUserMapper.selectById(request.getOperatorId());
        if (operator == null) {
            throw new BusinessException("操作人不存在");
        }

        if (request.getProdOrderId() != null) {
            ProdOrder prodOrder = prodOrderMapper.selectById(request.getProdOrderId());
            if (prodOrder == null) {
                throw new BusinessException("生产工单不存在");
            }
        }

        String mountType = request.getMountType();
        if (mountType == null || mountType.trim().isEmpty()) {
            throw new BusinessException("上下模类型不能为空");
        }
        try {
            MountType.valueOf(mountType);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException("上下模类型不合法");
        }

        MoldMountRecord record = new MoldMountRecord();
        BeanUtils.copyProperties(request, record);
        record.setOperateTime(request.getOperateTime() != null ? request.getOperateTime() : LocalDateTime.now());
        moldMountRecordMapper.insert(record);

        return R.ok("创建成功", convertToResponse(record));
    }

    private MoldMountRecordResponse convertToResponse(MoldMountRecord record) {
        MoldMountRecordResponse response = new MoldMountRecordResponse();
        BeanUtils.copyProperties(record, response);

        if (record.getMoldId() != null) {
            Mold mold = moldMapper.selectById(record.getMoldId());
            if (mold != null) {
                response.setMoldName(mold.getName());
            }
        }

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
            SysUser operator = sysUserMapper.selectById(record.getOperatorId());
            if (operator != null) {
                response.setOperatorName(operator.getRealName());
            }
        }

        return response;
    }
}
