package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 模具表
 */
@Data
@TableName("mold")
public class Mold {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private Long productId;
    private Integer cavities;
    private Integer lifetime;
    private Integer usedShots;
    private Integer maintenanceCycle;
    private LocalDateTime lastMaintenanceAt;
    private String status;
    private String remark;
    private LocalDateTime createdAt;
}
