package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 财务汇总响应
 */
@Data
public class FinanceSummaryResponse {

    private String currentMonth;
    private BigDecimal monthOrderAmount = BigDecimal.ZERO;
    private BigDecimal monthPaymentAmount = BigDecimal.ZERO;
    private BigDecimal monthExpenseTotal = BigDecimal.ZERO;
    private BigDecimal monthSalaryTotal = BigDecimal.ZERO;
    private BigDecimal monthMaterialCost = BigDecimal.ZERO;
    private BigDecimal monthGrossProfit = BigDecimal.ZERO;
    private BigDecimal receivableBalance = BigDecimal.ZERO;
    private List<MonthItem> monthItems = new ArrayList<>();

    @Data
    public static class MonthItem {
        private String month;
        private BigDecimal orderAmount = BigDecimal.ZERO;
        private BigDecimal paymentAmount = BigDecimal.ZERO;
        private BigDecimal expenseTotal = BigDecimal.ZERO;
        private BigDecimal salaryTotal = BigDecimal.ZERO;
        private BigDecimal materialCost = BigDecimal.ZERO;
        private BigDecimal grossProfit = BigDecimal.ZERO;
        private BigDecimal receivableBalance = BigDecimal.ZERO;
    }
}
