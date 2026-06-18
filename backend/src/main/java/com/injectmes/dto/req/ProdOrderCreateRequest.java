package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 创建生产工单请求
 */
@Data
public class ProdOrderCreateRequest {

    /** 销售订单ID */
    private Long saleOrderId;

    /** 销售订单明细ID */
    private Long saleOrderItemId;

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 注塑机ID */
    private Long machineId;

    /** 模具ID */
    private Long moldId;

    /** 计划数量 */
    @NotNull(message = "计划数量不能为空")
    private Integer planQty;

    /** 原料数量 */
    private java.math.BigDecimal rawMaterialQty;

    /** 计划开始时间 */
    private LocalDateTime planStart;

    /** 计划结束时间 */
    private LocalDateTime planEnd;

    /** 优先级 */
    private Integer priority;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
