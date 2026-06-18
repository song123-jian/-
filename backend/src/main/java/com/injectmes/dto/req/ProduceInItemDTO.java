package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 生产入库明细DTO
 */
@Data
public class ProduceInItemDTO {

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 批次号 */
    @NotBlank(message = "批次号不能为空")
    @Size(max = 50, message = "批次号长度不能超过50")
    private String batchNo;

    /** 数量 */
    @NotNull(message = "数量不能为空")
    private BigDecimal qty;
}
