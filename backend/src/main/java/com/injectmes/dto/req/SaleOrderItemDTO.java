package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 销售订单明细DTO
 */
@Data
public class SaleOrderItemDTO {

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 数量 */
    @NotNull(message = "数量不能为空")
    private Integer qty;

    /** 单价 */
    @NotNull(message = "单价不能为空")
    private BigDecimal unitPrice;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
