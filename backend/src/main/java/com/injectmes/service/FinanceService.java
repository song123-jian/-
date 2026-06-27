package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
import com.injectmes.dto.resp.FinanceSummaryResponse;
import com.injectmes.entity.*;
import com.injectmes.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/**
 * 财务汇总服务
 */
@Service
public class FinanceService {

    @Autowired
    private SaleOrderMapper saleOrderMapper;

    @Autowired
    private PaymentRecordMapper paymentRecordMapper;

    @Autowired
    private ExpenseRecordMapper expenseRecordMapper;

    @Autowired
    private SalaryDailyMapper salaryDailyMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private ProductMapper productMapper;

    public R<FinanceSummaryResponse> statements(Integer months) {
        int limit = months == null || months < 1 ? 6 : Math.min(months, 12);
        YearMonth currentMonth = YearMonth.now();

        FinanceSummaryResponse response = new FinanceSummaryResponse();
        response.setCurrentMonth(currentMonth.toString());

        FinanceSummaryResponse.MonthItem current = buildMonthItem(currentMonth);
        response.setMonthOrderAmount(current.getOrderAmount());
        response.setMonthPaymentAmount(current.getPaymentAmount());
        response.setMonthExpenseTotal(current.getExpenseTotal());
        response.setMonthSalaryTotal(current.getSalaryTotal());
        response.setMonthMaterialCost(current.getMaterialCost());
        response.setMonthGrossProfit(current.getGrossProfit());
        response.setReceivableBalance(current.getReceivableBalance());

        List<FinanceSummaryResponse.MonthItem> monthItems = new ArrayList<>();
        for (int i = limit - 1; i >= 0; i--) {
            monthItems.add(buildMonthItem(currentMonth.minusMonths(i)));
        }
        response.setMonthItems(monthItems);

        return R.ok(response);
    }

    private FinanceSummaryResponse.MonthItem buildMonthItem(YearMonth month) {
        LocalDate start = month.atDay(1);
        LocalDate end = month.plusMonths(1).atDay(1);
        LocalDateTime startTime = start.atStartOfDay();
        LocalDateTime endTime = end.atStartOfDay();

        BigDecimal orderAmount = sumOrderAmount(start, end);
        BigDecimal paymentAmount = sumPaymentAmount(start, end);
        BigDecimal expenseTotal = sumExpenseAmount(start, end);
        BigDecimal salaryTotal = sumSalaryAmount(start, end);
        BigDecimal materialCost = sumMaterialCost(startTime, endTime);
        BigDecimal grossProfit = paymentAmount.subtract(materialCost).subtract(salaryTotal).subtract(expenseTotal);
        BigDecimal receivableBalance = sumReceivableBalance(start, end);

        FinanceSummaryResponse.MonthItem item = new FinanceSummaryResponse.MonthItem();
        item.setMonth(month.toString());
        item.setOrderAmount(orderAmount);
        item.setPaymentAmount(paymentAmount);
        item.setExpenseTotal(expenseTotal);
        item.setSalaryTotal(salaryTotal);
        item.setMaterialCost(materialCost);
        item.setGrossProfit(grossProfit);
        item.setReceivableBalance(receivableBalance);
        return item;
    }

    private BigDecimal sumOrderAmount(LocalDate start, LocalDate end) {
        List<SaleOrder> orders = saleOrderMapper.selectList(new LambdaQueryWrapper<SaleOrder>()
                .ge(SaleOrder::getOrderDate, start)
                .lt(SaleOrder::getOrderDate, end)
                .ne(SaleOrder::getStatus, "DRAFT")
                .ne(SaleOrder::getStatus, "CANCELLED"));
        return orders.stream()
                .map(SaleOrder::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumPaymentAmount(LocalDate start, LocalDate end) {
        List<PaymentRecord> records = paymentRecordMapper.selectList(new LambdaQueryWrapper<PaymentRecord>()
                .ge(PaymentRecord::getPayDate, start)
                .lt(PaymentRecord::getPayDate, end));
        return records.stream()
                .map(PaymentRecord::getPayAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumExpenseAmount(LocalDate start, LocalDate end) {
        List<ExpenseRecord> records = expenseRecordMapper.selectList(new LambdaQueryWrapper<ExpenseRecord>()
                .ge(ExpenseRecord::getExpenseDate, start)
                .lt(ExpenseRecord::getExpenseDate, end));
        return records.stream()
                .map(ExpenseRecord::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumSalaryAmount(LocalDate start, LocalDate end) {
        List<SalaryDaily> records = salaryDailyMapper.selectList(new LambdaQueryWrapper<SalaryDaily>()
                .ge(SalaryDaily::getWorkDate, start)
                .lt(SalaryDaily::getWorkDate, end));
        return records.stream()
                .map(SalaryDaily::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumReceivableBalance(LocalDate start, LocalDate end) {
        List<SaleOrder> orders = saleOrderMapper.selectList(new LambdaQueryWrapper<SaleOrder>()
                .ge(SaleOrder::getOrderDate, start)
                .lt(SaleOrder::getOrderDate, end)
                .ne(SaleOrder::getStatus, "DRAFT")
                .ne(SaleOrder::getStatus, "CANCELLED"));
        return orders.stream()
                .map(order -> {
                    BigDecimal total = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
                    BigDecimal received = order.getReceivedAmount() != null ? order.getReceivedAmount() : BigDecimal.ZERO;
                    return total.subtract(received);
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumMaterialCost(LocalDateTime startTime, LocalDateTime endTime) {
        List<ProdOrder> orders = prodOrderMapper.selectList(new LambdaQueryWrapper<ProdOrder>()
                .ge(ProdOrder::getActualEnd, startTime)
                .lt(ProdOrder::getActualEnd, endTime)
                .eq(ProdOrder::getStatus, "FINISHED"));
        BigDecimal total = BigDecimal.ZERO;
        for (ProdOrder order : orders) {
            if (order.getProductId() == null) {
                continue;
            }
            Product product = productMapper.selectById(order.getProductId());
            if (product == null || product.getWeightG() == null || product.getRawMaterialUsage() == null) {
                continue;
            }
            int outputQty = order.getQualifiedQty() != null && order.getQualifiedQty() > 0
                    ? order.getQualifiedQty()
                    : (order.getCompletedQty() != null ? order.getCompletedQty() : 0);
            if (outputQty <= 0) {
                continue;
            }
            BigDecimal orderCost = product.getWeightG()
                    .multiply(product.getRawMaterialUsage())
                    .multiply(BigDecimal.valueOf(outputQty))
                    .divide(new BigDecimal("1000"), 4, RoundingMode.HALF_UP);
            total = total.add(orderCost);
        }
        return total;
    }
}
