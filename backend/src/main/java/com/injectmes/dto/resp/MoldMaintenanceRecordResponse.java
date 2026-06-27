package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 模具保养记录响应
 */
@Data
public class MoldMaintenanceRecordResponse {
    private Long id;
    private Long moldId;
    private String moldName;
    private Long operatorId;
    private String operatorName;
    private Integer usedShotsBefore;
    private Integer shotsSinceMaintenanceBefore;
    private Integer maintenanceCountBefore;
    private LocalDateTime operateTime;
    private String remark;
}
