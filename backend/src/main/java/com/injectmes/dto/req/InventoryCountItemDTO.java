package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 盘点明细DTO
 */
@Data
public class InventoryCountItemDTO {

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 库位ID */
    @NotNull(message = "库位不能为空")
    private Long locationId;

    /** 批次ID */
    @NotNull(message = "批次不能为空")
    private Long batchId;

    /** 实际数量 */
    @NotNull(message = "实际数量不能为空")
    private BigDecimal actualQty;

    /** 原因 */
    @Size(max = 500, message = "原因长度不能超过500")
    private String reason;
}
