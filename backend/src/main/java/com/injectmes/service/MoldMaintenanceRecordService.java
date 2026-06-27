package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MoldMaintenanceRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.Mold;
import com.injectmes.entity.MoldMaintenanceRecord;
import com.injectmes.entity.SysUser;
import com.injectmes.mapper.MoldMaintenanceRecordMapper;
import com.injectmes.mapper.MoldMapper;
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
 * 模具保养记录服务
 */
@Service
public class MoldMaintenanceRecordService {

    @Autowired
    private MoldMaintenanceRecordMapper moldMaintenanceRecordMapper;

    @Autowired
    private MoldMapper moldMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    public R<PageResponse<MoldMaintenanceRecordResponse>> list(PageRequest request, Long moldId, Long operatorId,
                                                               LocalDate startDate, LocalDate endDate) {
        Page<MoldMaintenanceRecord> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<MoldMaintenanceRecord> wrapper = new LambdaQueryWrapper<>();

        if (moldId != null) {
            wrapper.eq(MoldMaintenanceRecord::getMoldId, moldId);
        }
        if (operatorId != null) {
            wrapper.eq(MoldMaintenanceRecord::getOperatorId, operatorId);
        }
        if (startDate != null) {
            wrapper.ge(MoldMaintenanceRecord::getOperateTime, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(MoldMaintenanceRecord::getOperateTime, endDate.plusDays(1).atStartOfDay());
        }

        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w.like(MoldMaintenanceRecord::getRemark, keyword));
        }

        wrapper.orderByDesc(MoldMaintenanceRecord::getOperateTime);
        Page<MoldMaintenanceRecord> result = moldMaintenanceRecordMapper.selectPage(page, wrapper);

        List<MoldMaintenanceRecordResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<MoldMaintenanceRecordResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());
        return R.ok(pageResponse);
    }

    @Transactional
    public void recordMaintenance(Long moldId, Long operatorId, Integer usedShotsBefore,
                                  Integer shotsSinceMaintenanceBefore, Integer maintenanceCountBefore,
                                  LocalDateTime operateTime, String remark) {
        MoldMaintenanceRecord record = new MoldMaintenanceRecord();
        record.setMoldId(moldId);
        record.setOperatorId(operatorId);
        record.setUsedShotsBefore(usedShotsBefore);
        record.setShotsSinceMaintenanceBefore(shotsSinceMaintenanceBefore);
        record.setMaintenanceCountBefore(maintenanceCountBefore);
        record.setOperateTime(operateTime != null ? operateTime : LocalDateTime.now());
        record.setRemark(remark);
        moldMaintenanceRecordMapper.insert(record);
    }

    private MoldMaintenanceRecordResponse convertToResponse(MoldMaintenanceRecord record) {
        MoldMaintenanceRecordResponse response = new MoldMaintenanceRecordResponse();
        BeanUtils.copyProperties(record, response);

        if (record.getMoldId() != null) {
            Mold mold = moldMapper.selectById(record.getMoldId());
            if (mold != null) {
                response.setMoldName(mold.getName());
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
