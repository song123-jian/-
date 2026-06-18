package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;

/**
 * OEE响应
 */
@Data
public class OeeResponse {

    /** 时间开动率 */
    private BigDecimal timeAvailability;

    /** 性能开动率 */
    private BigDecimal performanceRate;

    /** 合格品率 */
    private BigDecimal qualityRate;

    /** OEE */
    private BigDecimal oee;
}
