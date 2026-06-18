package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 领料明细DTO
 */
@Data
public class PickingItemDTO {

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 库位ID */
    @NotNull(message = "库位不能为空")
    private Long locationId;

    /** 批次ID */
    @NotNull(message = "批次不能为空")
    private Long batchId;

    /** 数量 */
    @NotNull(message = "数量不能为空")
    private BigDecimal qty;
}
