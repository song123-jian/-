package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 发货明细DTO
 */
@Data
public class DeliveryItemDTO {

    /** 销售订单明细ID */
    @NotNull(message = "销售订单明细不能为空")
    private Long saleOrderItemId;

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 数量 */
    @NotNull(message = "数量不能为空")
    private Integer qty;
}
