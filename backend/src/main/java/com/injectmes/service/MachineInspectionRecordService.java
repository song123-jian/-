package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.MachineInspectionRecordRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MachineInspectionRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.Machine;
import com.injectmes.entity.MachineInspectionRecord;
import com.injectmes.entity.SysUser;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MachineInspectionRecordMapper;
import com.injectmes.mapper.MachineMapper;
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
 * 设备点检记录服务
 */
@Service
public class MachineInspectionRecordService {

    @Autowired
    private MachineInspectionRecordMapper machineInspectionRecordMapper;

    @Autowired
    private MachineMapper machineMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    public R<PageResponse<MachineInspectionRecordResponse>> list(PageRequest request, Long machineId,
                                                                 Long inspectorId, String result,
                                                                 LocalDate startDate, LocalDate endDate) {
        Page<MachineInspectionRecord> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<MachineInspectionRecord> wrapper = new LambdaQueryWrapper<>();
        if (machineId != null) {
            wrapper.eq(MachineInspectionRecord::getMachineId, machineId);
        }
        if (inspectorId != null) {
            wrapper.eq(MachineInspectionRecord::getInspectorId, inspectorId);
        }
        if (result != null && !result.trim().isEmpty()) {
            wrapper.eq(MachineInspectionRecord::getResult, result);
        }
        if (startDate != null) {
            wrapper.ge(MachineInspectionRecord::getInspectTime, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(MachineInspectionRecord::getInspectTime, endDate.plusDays(1).atStartOfDay());
        }
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w.like(MachineInspectionRecord::getIssues, keyword)
                    .or()
                    .like(MachineInspectionRecord::getRemark, keyword));
        }
        wrapper.orderByDesc(MachineInspectionRecord::getInspectTime);

        Page<MachineInspectionRecord> resultPage = machineInspectionRecordMapper.selectPage(page, wrapper);
        List<MachineInspectionRecordResponse> records = resultPage.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<MachineInspectionRecordResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(resultPage.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());
        return R.ok(pageResponse);
    }

    @Transactional
    public R<MachineInspectionRecordResponse> create(MachineInspectionRecordRequest request) {
        Machine machine = machineMapper.selectById(request.getMachineId());
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }
        SysUser inspector = sysUserMapper.selectById(request.getInspectorId());
        if (inspector == null) {
            throw new BusinessException("点检人不存在");
        }

        MachineInspectionRecord record = new MachineInspectionRecord();
        BeanUtils.copyProperties(request, record);
        record.setInspectTime(request.getInspectTime() != null ? request.getInspectTime() : LocalDateTime.now());
        machineInspectionRecordMapper.insert(record);
        return R.ok("创建成功", convertToResponse(record));
    }

    private MachineInspectionRecordResponse convertToResponse(MachineInspectionRecord record) {
        MachineInspectionRecordResponse response = new MachineInspectionRecordResponse();
        BeanUtils.copyProperties(record, response);

        if (record.getMachineId() != null) {
            Machine machine = machineMapper.selectById(record.getMachineId());
            if (machine != null) {
                response.setMachineName(machine.getName());
            }
        }
        if (record.getInspectorId() != null) {
            SysUser user = sysUserMapper.selectById(record.getInspectorId());
            if (user != null) {
                response.setInspectorName(user.getRealName());
            }
        }
        return response;
    }
}
