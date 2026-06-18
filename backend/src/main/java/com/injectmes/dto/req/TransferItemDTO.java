package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 调拨明细DTO
 */
@Data
public class TransferItemDTO {

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 源库位ID */
    @NotNull(message = "源库位不能为空")
    private Long fromLocationId;

    /** 目标库位ID */
    @NotNull(message = "目标库位不能为空")
    private Long toLocationId;

    /** 源批次ID */
    @NotNull(message = "源批次不能为空")
    private Long fromBatchId;

    /** 数量 */
    @NotNull(message = "数量不能为空")
    private BigDecimal qty;
}
