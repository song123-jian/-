package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 生产工单响应
 */
@Data
public class ProdOrderResponse {

    /** ID */
    private Long id;

    /** 工单编号 */
    private String orderNo;

    /** 销售订单ID */
    private Long saleOrderId;

    /** 销售订单明细ID */
    private Long saleOrderItemId;

    /** 产品ID */
    private Long productId;

    /** 产品名称 */
    private String productName;

    /** 注塑机ID */
    private Long machineId;

    /** 注塑机名称 */
    private String machineName;

    /** 模具ID */
    private Long moldId;

    /** 模具名称 */
    private String moldName;

    /** 计划数量 */
    private Integer planQty;

    /** 完成数量 */
    private Integer completedQty;

    /** 不良数量 */
    private Integer badQty;

    /** 原料数量 */
    private BigDecimal rawMaterialQty;

    /** 计划开始时间 */
    private LocalDateTime planStart;

    /** 计划结束时间 */
    private LocalDateTime planEnd;

    /** 优先级 */
    private Integer priority;

    /** 状态 */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;
}
