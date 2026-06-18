package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 老板看板响应
 */
@Data
public class DashboardBossResponse {

    /** 本月订单金额 */
    private BigDecimal monthOrderAmount;

    /** 本月收款金额 */
    private BigDecimal monthPaymentAmount;

    /** 应收余额 */
    private BigDecimal receivableBalance;

    /** 回款率 */
    private BigDecimal paymentRate;

    /** 本月完成数量 */
    private Integer monthCompletedQty;

    /** 本月不良率 */
    private BigDecimal monthBadRate;

    /** 本月工资总额 */
    private BigDecimal monthSalaryTotal;

    /** 本月费用总额 */
    private BigDecimal monthExpenseTotal;

    /** 本月毛利润 */
    private BigDecimal monthGrossProfit;

    /** OEE */
    private BigDecimal oee;
}
