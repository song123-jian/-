package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 模具响应
 */
@Data
public class MoldResponse {

    /** ID */
    private Long id;

    /** 模具编码 */
    private String code;

    /** 模具名称 */
    private String name;

    /** 关联产品ID */
    private Long productId;

    /** 穴数 */
    private Integer cavities;

    /** 寿命（模次） */
    private Integer lifetime;

    /** 已用模次 */
    private Integer usedShots;

    /** 距上次保养已用模次 */
    private Integer shotsSinceMaintenance;

    /** 保养周期（模次） */
    private Integer maintenanceCycle;

    /** 保养次数 */
    private Integer maintenanceCount;

    /** 上次保养时间 */
    private LocalDateTime lastMaintenanceAt;

    /** 剩余寿命模次 */
    private Integer remainingShots;

    /** 使用率 */
    private Double usageRate;

    /** 距下次保养剩余模次 */
    private Integer remainingToMaintenance;

    /** 保养进度 */
    private Double maintenanceRate;

    /** 关联产品名称 */
    private String productName;

    /** 状态 */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
