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

    /** 保养周期（模次） */
    private Integer maintenanceCycle;

    /** 上次保养时间 */
    private LocalDateTime lastMaintenanceAt;

    /** 状态 */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
