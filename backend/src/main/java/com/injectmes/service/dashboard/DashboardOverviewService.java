package com.injectmes.service.dashboard;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.DashboardBossResponse;
import com.injectmes.dto.resp.DashboardHomeResponse;
import com.injectmes.dto.resp.NotificationResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.OeeResponse;
import com.injectmes.entity.DowntimeRecord;
import com.injectmes.entity.ExpenseRecord;
import com.injectmes.entity.Machine;
import com.injectmes.entity.Notification;
import com.injectmes.entity.PaymentRecord;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.ProdReport;
import com.injectmes.entity.Product;
import com.injectmes.entity.SalaryDaily;
import com.injectmes.entity.SaleOrder;
import com.injectmes.enums.SaleOrderStatus;
import com.injectmes.mapper.DowntimeRecordMapper;
import com.injectmes.mapper.ExpenseRecordMapper;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.NotificationMapper;
import com.injectmes.mapper.PaymentRecordMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.SalaryDailyMapper;
import com.injectmes.mapper.SaleOrderMapper;
import com.injectmes.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
public class DashboardOverviewService {

    @Autowired
    private SaleOrderMapper saleOrderMapper;
    @Autowired
    private PaymentRecordMapper paymentRecordMapper;
    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private ProdReportMapper prodReportMapper;
    @Autowired
    private SalaryDailyMapper salaryDailyMapper;
    @Autowired
    private ExpenseRecordMapper expenseRecordMapper;
    @Autowired
    private MachineMapper machineMapper;
    @Autowired
    private DowntimeRecordMapper downtimeRecordMapper;
    @Autowired
    private ProductMapper productMapper;
    @Autowired
    private NotificationService notificationService;

    public R<DashboardHomeResponse> homeDashboard(Long userId) {
        DashboardHomeResponse response = new DashboardHomeResponse();

        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime dayEnd = today.plusDays(1).atStartOfDay();

        List<ProdReport> todayReports = prodReportMapper.selectList(new LambdaQueryWrapper<ProdReport>()
                .ge(ProdReport::getCreatedAt, dayStart)
                .lt(ProdReport::getCreatedAt, dayEnd));
        response.setTodayProductionQty(todayReports.stream()
                .mapToInt(report -> report.getQty() != null ? report.getQty() : 0)
                .sum());

        response.setPendingOrderQty(Math.toIntExact(prodOrderMapper.selectCount(
                new LambdaQueryWrapper<ProdOrder>()
                        .in(ProdOrder::getStatus, "SCHEDULED", "RUNNING", "PAUSED"))));

        response.setRunningMachineQty(Math.toIntExact(machineMapper.selectCount(
                new LambdaQueryWrapper<Machine>().eq(Machine::getStatus, "RUNNING"))));

        long unreadCount = 0L;
        List<DashboardHomeResponse.TodoItem> todoList = new ArrayList<>();
        if (userId != null) {
            unreadCount = notificationService.countUnread(userId);

            PageRequest notificationRequest = new PageRequest();
            notificationRequest.setPage(1);
            notificationRequest.setSize(5);
            R<PageResponse<NotificationResponse>> unreadResult =
                    notificationService.list(userId, notificationRequest, 0);
            if (unreadResult != null && unreadResult.getData() != null
                    && unreadResult.getData().getRecords() != null) {
                todoList = unreadResult.getData().getRecords().stream()
                        .map(this::convertToTodoItem)
                        .collect(Collectors.toList());
            }
        }
        response.setUnreadNotificationQty(unreadCount);
        response.setTodoList(todoList);
        response.setProductionTrend(buildProductionTrend());
        response.setOrderStatusDistribution(buildOrderStatusDistribution());
        return R.ok(response);
    }

    public R<DashboardBossResponse> bossDashboard() {
        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.plusMonths(1).atDay(1);

        List<SaleOrder> monthOrders = saleOrderMapper.selectList(new LambdaQueryWrapper<SaleOrder>()
                .ge(SaleOrder::getOrderDate, monthStart)
                .lt(SaleOrder::getOrderDate, monthEnd)
                .ne(SaleOrder::getStatus, "DRAFT"));
        BigDecimal monthOrderAmount = monthOrders.stream()
                .map(SaleOrder::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<PaymentRecord> monthPayments = paymentRecordMapper.selectList(new LambdaQueryWrapper<PaymentRecord>()
                .ge(PaymentRecord::getPayDate, monthStart)
                .lt(PaymentRecord::getPayDate, monthEnd));
        BigDecimal monthPaymentAmount = monthPayments.stream()
                .map(PaymentRecord::getPayAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<SaleOrder> allOrders = saleOrderMapper.selectList(new LambdaQueryWrapper<SaleOrder>()
                .ne(SaleOrder::getStatus, "DRAFT")
                .ne(SaleOrder::getStatus, "CANCELLED"));
        BigDecimal totalOrderAmount = allOrders.stream()
                .map(SaleOrder::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalReceivedAmount = allOrders.stream()
                .map(SaleOrder::getReceivedAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal receivableBalance = totalOrderAmount.subtract(totalReceivedAmount);

        BigDecimal paymentRate = BigDecimal.ZERO;
        if (monthOrderAmount.compareTo(BigDecimal.ZERO) > 0) {
            paymentRate = monthPaymentAmount.multiply(new BigDecimal("100"))
                    .divide(monthOrderAmount, 2, RoundingMode.HALF_UP);
        }

        LocalDateTime monthStartTime = monthStart.atStartOfDay();
        LocalDateTime monthEndTime = monthEnd.atStartOfDay();
        List<ProdOrder> finishedOrders = prodOrderMapper.selectList(new LambdaQueryWrapper<ProdOrder>()
                .ge(ProdOrder::getActualEnd, monthStartTime)
                .lt(ProdOrder::getActualEnd, monthEndTime)
                .eq(ProdOrder::getStatus, "FINISHED"));
        int monthCompletedQty = finishedOrders.stream()
                .mapToInt(o -> o.getQualifiedQty() != null ? o.getQualifiedQty() : 0)
                .sum();

        List<ProdOrder> monthProdOrders = prodOrderMapper.selectList(new LambdaQueryWrapper<ProdOrder>()
                .ge(ProdOrder::getCreatedAt, monthStartTime)
                .lt(ProdOrder::getCreatedAt, monthEndTime));
        int totalBadQty = monthProdOrders.stream()
                .mapToInt(o -> o.getBadQty() != null ? o.getBadQty() : 0)
                .sum();
        int totalQty = monthProdOrders.stream()
                .mapToInt(o -> o.getCompletedQty() != null ? o.getCompletedQty() : 0)
                .sum();
        BigDecimal monthBadRate = BigDecimal.ZERO;
        if (totalQty > 0) {
            monthBadRate = new BigDecimal(totalBadQty).multiply(new BigDecimal("100"))
                    .divide(new BigDecimal(totalQty), 2, RoundingMode.HALF_UP);
        }

        List<SalaryDaily> monthSalaryList = salaryDailyMapper.selectList(new LambdaQueryWrapper<SalaryDaily>()
                .ge(SalaryDaily::getWorkDate, monthStart)
                .lt(SalaryDaily::getWorkDate, monthEnd));
        BigDecimal monthSalaryTotal = monthSalaryList.stream()
                .map(SalaryDaily::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<ExpenseRecord> monthExpenses = expenseRecordMapper.selectList(new LambdaQueryWrapper<ExpenseRecord>()
                .ge(ExpenseRecord::getExpenseDate, monthStart)
                .lt(ExpenseRecord::getExpenseDate, monthEnd));
        BigDecimal monthExpenseTotal = monthExpenses.stream()
                .map(ExpenseRecord::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal rawMaterialCost = BigDecimal.ZERO;
        for (ProdOrder order : finishedOrders) {
            if (order.getProductId() != null) {
                Product product = productMapper.selectById(order.getProductId());
                if (product != null && product.getRawMaterialUsage() != null && product.getWeightG() != null) {
                    BigDecimal orderRawCost = product.getRawMaterialUsage()
                            .multiply(product.getWeightG())
                            .divide(new BigDecimal("1000"), 4, RoundingMode.HALF_UP);
                    rawMaterialCost = rawMaterialCost.add(orderRawCost);
                }
            }
        }
        BigDecimal monthGrossProfit = monthPaymentAmount
                .subtract(rawMaterialCost)
                .subtract(monthSalaryTotal)
                .subtract(monthExpenseTotal);

        DashboardBossResponse response = new DashboardBossResponse();
        response.setMonthOrderAmount(monthOrderAmount);
        response.setMonthPaymentAmount(monthPaymentAmount);
        response.setReceivableBalance(receivableBalance);
        response.setPaymentRate(paymentRate);
        response.setMonthCompletedQty(monthCompletedQty);
        response.setMonthBadRate(monthBadRate);
        response.setMonthSalaryTotal(monthSalaryTotal);
        response.setMonthExpenseTotal(monthExpenseTotal);
        response.setMonthGrossProfit(monthGrossProfit);
        response.setOee(calculateAverageOee(LocalDate.now()));
        return R.ok(response);
    }

    private List<DashboardHomeResponse.ProductionTrend> buildProductionTrend() {
        List<DashboardHomeResponse.ProductionTrend> trendList = new ArrayList<>();
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("MM-dd");

        for (int offset = 6; offset >= 0; offset--) {
            LocalDate date = LocalDate.now().minusDays(offset);
            LocalDateTime start = date.atStartOfDay();
            LocalDateTime end = date.plusDays(1).atStartOfDay();

            List<ProdReport> reports = prodReportMapper.selectList(new LambdaQueryWrapper<ProdReport>()
                    .ge(ProdReport::getCreatedAt, start)
                    .lt(ProdReport::getCreatedAt, end));

            int qty = reports.stream()
                    .mapToInt(report -> report.getQty() != null ? report.getQty() : 0)
                    .sum();

            DashboardHomeResponse.ProductionTrend item = new DashboardHomeResponse.ProductionTrend();
            item.setDate(date.format(formatter));
            item.setQty(qty);
            trendList.add(item);
        }

        return trendList;
    }

    private List<DashboardHomeResponse.OrderStatusItem> buildOrderStatusDistribution() {
        Map<String, Integer> statusCountMap = new LinkedHashMap<>();
        for (SaleOrderStatus status : SaleOrderStatus.values()) {
            statusCountMap.put(status.name(), 0);
        }

        List<SaleOrder> orders = saleOrderMapper.selectList(new LambdaQueryWrapper<>());
        for (SaleOrder order : orders) {
            if (order.getStatus() == null) {
                continue;
            }
            statusCountMap.merge(order.getStatus(), 1, Integer::sum);
        }

        List<DashboardHomeResponse.OrderStatusItem> result = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : statusCountMap.entrySet()) {
            DashboardHomeResponse.OrderStatusItem item = new DashboardHomeResponse.OrderStatusItem();
            item.setStatus(entry.getKey());
            item.setLabel(resolveSaleOrderStatusLabel(entry.getKey()));
            item.setCount(entry.getValue());
            result.add(item);
        }
        return result;
    }

    private DashboardHomeResponse.TodoItem convertToTodoItem(NotificationResponse notification) {
        DashboardHomeResponse.TodoItem item = new DashboardHomeResponse.TodoItem();
        item.setType(resolveNotificationTypeLabel(notification.getType()));
        item.setContent(buildNotificationContent(notification));
        item.setTime(notification.getCreatedAt());
        item.setStatus(resolveNotificationPriority(notification.getType()));
        return item;
    }

    private String resolveSaleOrderStatusLabel(String status) {
        if (status == null) {
            return "未知";
        }
        for (SaleOrderStatus item : SaleOrderStatus.values()) {
            if (item.name().equals(status)) {
                return item.getDescription();
            }
        }
        return status;
    }

    private String resolveNotificationTypeLabel(String type) {
        if ("ERROR".equals(type)) {
            return "异常";
        }
        if ("WARNING".equals(type)) {
            return "预警";
        }
        if ("INFO".equals(type)) {
            return "消息";
        }
        return "消息";
    }

    private String resolveNotificationPriority(String type) {
        if ("ERROR".equals(type)) {
            return "紧急";
        }
        if ("WARNING".equals(type)) {
            return "一般";
        }
        return "提醒";
    }

    private String buildNotificationContent(NotificationResponse notification) {
        String title = notification.getTitle() != null ? notification.getTitle() : "";
        String content = notification.getContent() != null ? notification.getContent() : "";
        if (title.isEmpty()) {
            return content;
        }
        if (content.isEmpty()) {
            return title;
        }
        return title + "：" + content;
    }

    public R<OeeResponse> oeeStats(Long machineId, LocalDate date) {
        if (date == null) {
            date = LocalDate.now();
        }
        if (machineId != null) {
            return R.ok(calculateOee(machineId, date));
        }
        OeeResponse response = new OeeResponse();
        response.setTimeAvailability(null);
        response.setPerformanceRate(null);
        response.setQualityRate(null);
        response.setOee(calculateAverageOee(date));
        return R.ok(response);
    }

    private OeeResponse calculateOee(Long machineId, LocalDate date) {
        OeeResponse response = new OeeResponse();

        LocalDateTime dayStart = date.atStartOfDay();
        LocalDateTime dayEnd = date.plusDays(1).atStartOfDay();
        int shiftTotalMinutes = 960;

        List<DowntimeRecord> downtimeRecords = downtimeRecordMapper.selectList(new LambdaQueryWrapper<DowntimeRecord>()
                .eq(DowntimeRecord::getMachineId, machineId)
                .ge(DowntimeRecord::getStartTime, dayStart)
                .lt(DowntimeRecord::getStartTime, dayEnd));

        int plannedDowntimeMinutes = downtimeRecords.stream()
                .filter(r -> "MOLD_CHANGE".equals(r.getReason()) || "BREAK".equals(r.getReason()))
                .mapToInt(r -> r.getDurationMinutes() != null ? r.getDurationMinutes() : 0)
                .sum();
        int unplannedDowntimeMinutes = downtimeRecords.stream()
                .filter(r -> !"MOLD_CHANGE".equals(r.getReason()) && !"BREAK".equals(r.getReason()))
                .mapToInt(r -> r.getDurationMinutes() != null ? r.getDurationMinutes() : 0)
                .sum();

        int plannedRunMinutes = shiftTotalMinutes - plannedDowntimeMinutes;
        int actualRunMinutes = Math.max(plannedRunMinutes - unplannedDowntimeMinutes, 0);

        BigDecimal timeAvailability = BigDecimal.ZERO;
        if (plannedRunMinutes > 0) {
            timeAvailability = new BigDecimal(actualRunMinutes)
                    .divide(new BigDecimal(plannedRunMinutes), 4, RoundingMode.HALF_UP);
        }

        List<ProdReport> dayReports = prodReportMapper.selectList(new LambdaQueryWrapper<ProdReport>()
                .eq(ProdReport::getMachineId, machineId)
                .ge(ProdReport::getCreatedAt, dayStart)
                .lt(ProdReport::getCreatedAt, dayEnd));

        int actualOutput = dayReports.stream()
                .mapToInt(r -> r.getQty() != null ? r.getQty() : 0)
                .sum();

        int theoreticalOutput = 0;
        List<ProdOrder> machineOrders = prodOrderMapper.selectList(new LambdaQueryWrapper<ProdOrder>()
                .eq(ProdOrder::getMachineId, machineId)
                .in(ProdOrder::getStatus, "RUNNING", "FINISHED"));

        if (!machineOrders.isEmpty() && actualRunMinutes > 0) {
            ProdOrder order = machineOrders.get(0);
            if (order.getProductId() != null) {
                Product product = productMapper.selectById(order.getProductId());
                if (product != null) {
                    int cycleTimeSec = product.getCycleTimeSec() != null ? product.getCycleTimeSec() : 1;
                    int cavityYield = product.getCavityYield() != null ? product.getCavityYield() : 1;
                    theoreticalOutput = (actualRunMinutes * 60) / cycleTimeSec * cavityYield;
                }
            }
        }

        BigDecimal performanceRate = BigDecimal.ZERO;
        if (theoreticalOutput > 0) {
            performanceRate = new BigDecimal(actualOutput)
                    .divide(new BigDecimal(theoreticalOutput), 4, RoundingMode.HALF_UP);
        }

        int totalBadQty = dayReports.stream()
                .mapToInt(r -> r.getBadQty() != null ? r.getBadQty() : 0)
                .sum();
        BigDecimal qualityRate = BigDecimal.ONE;
        if (actualOutput > 0) {
            qualityRate = new BigDecimal(actualOutput - totalBadQty)
                    .divide(new BigDecimal(actualOutput), 4, RoundingMode.HALF_UP);
        }

        BigDecimal oee = timeAvailability.multiply(performanceRate).multiply(qualityRate)
                .multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP);

        response.setTimeAvailability(timeAvailability.multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP));
        response.setPerformanceRate(performanceRate.multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP));
        response.setQualityRate(qualityRate.multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP));
        response.setOee(oee);
        return response;
    }

    private BigDecimal calculateAverageOee(LocalDate date) {
        List<Machine> machines = machineMapper.selectList(null);
        if (machines.isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal totalOee = BigDecimal.ZERO;
        int count = 0;
        for (Machine machine : machines) {
            OeeResponse oee = calculateOee(machine.getId(), date);
            if (oee.getOee() != null) {
                totalOee = totalOee.add(oee.getOee());
                count++;
            }
        }

        if (count > 0) {
            return totalOee.divide(new BigDecimal(count), 2, RoundingMode.HALF_UP);
        }
        return BigDecimal.ZERO;
    }
}
