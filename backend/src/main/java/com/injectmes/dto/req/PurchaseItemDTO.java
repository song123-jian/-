package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 采购入库明细DTO
 */
@Data
public class PurchaseItemDTO {

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 批次号 */
    @Size(max = 50, message = "批次号长度不能超过50")
    private String batchNo;

    /** 生产日期 */
    private LocalDate productionDate;

    /** 有效期 */
    private LocalDate expiryDate;

    /** 数量 */
    @NotNull(message = "数量不能为空")
    private BigDecimal qty;

    /** 单价 */
    private BigDecimal unitPrice;
}
