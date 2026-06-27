package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 称重请求
 */
@Data
public class DeviceScaleRequest {

    private Long productId;

    @NotNull(message = "毛重不能为空")
    private BigDecimal grossWeight;

    private BigDecimal tareWeight;

    private BigDecimal unitWeight;
}
