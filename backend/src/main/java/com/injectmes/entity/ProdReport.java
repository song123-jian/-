package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 报工记录表
 */
@Data
@TableName("prod_report")
public class ProdReport {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long prodOrderId;
    private Long userId;
    private Long machineId;
    private Long moldId;
    private String reportType;
    private String shift;
    private Integer qty;
    private Integer badQty;
    private Integer shots;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer workMinutes;
    private Integer syncStatus;
    private LocalDateTime createdAt;
}
