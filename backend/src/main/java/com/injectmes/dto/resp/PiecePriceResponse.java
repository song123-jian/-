package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 计件单价响应
 */
@Data
public class PiecePriceResponse {

    /** ID */
    private Long id;

    /** 产品ID */
    private Long productId;

    /** 产品名称 */
    private String productName;

    /** 工序名称 */
    private String processName;

    /** 单价 */
    private BigDecimal price;

    /** 生效日期 */
    private LocalDate effectiveDate;

    /** 失效日期 */
    private LocalDate expireDate;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
