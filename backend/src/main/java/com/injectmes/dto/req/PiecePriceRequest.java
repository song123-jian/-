package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 计件单价请求
 */
@Data
public class PiecePriceRequest {

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 工序名称 */
    @NotBlank(message = "工序名称不能为空")
    @Size(max = 100, message = "工序名称长度不能超过100")
    private String processName;

    /** 单价 */
    @NotNull(message = "单价不能为空")
    private BigDecimal price;

    /** 生效日期 */
    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;

    /** 失效日期 */
    private LocalDate expireDate;
}
