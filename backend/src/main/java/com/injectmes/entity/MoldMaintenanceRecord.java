package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 模具保养记录表
 */
@Data
@TableName("mold_maintenance_record")
public class MoldMaintenanceRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long moldId;
    private Long operatorId;
    private Integer usedShotsBefore;
    private Integer shotsSinceMaintenanceBefore;
    private Integer maintenanceCountBefore;
    private LocalDateTime operateTime;
    private String remark;
}
