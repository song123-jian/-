package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
import com.injectmes.dto.resp.DashboardBossResponse;
import com.injectmes.dto.resp.DashboardProductionResponse;
import com.injectmes.dto.resp.DashboardQualityResponse;
import com.injectmes.dto.resp.OeeResponse;
import com.injectmes.entity.*;
import com.injectmes.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 报表看板服务
 */
@Service
public class DashboardService {

    @Autowired
    private SaleOrderMapper saleOrderMapper;
    @Autowired
    private PaymentRecordMapper paymentRecordMapper;
    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private ProdReportMapper prodReportMapper;
    @Autowired
    private QcRecordMapper qcRecordMapper;
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

    /**
     * 老板驾驶舱数据（严格按技术文档11.1节）
     */
    public R<DashboardBossResponse> bossDashboard() {
        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.plusMonths(1).atDay(1);

        // 当月订单总额 = Σ(当月确认的 sale_order.total_amount)
        LambdaQueryWrapper<SaleOrder> orderWrapper = new LambdaQueryWrapper<>();
        orderWrapper.ge(SaleOrder::getOrderDate, monthStart);
        orderWrapper.lt(SaleOrder::getOrderDate, monthEnd);
        orderWrapper.ne(SaleOrder::getStatus, "DRAFT");
        List<SaleOrder> monthOrders = saleOrderMapper.selectList(orderWrapper);
        BigDecimal monthOrderAmount = monthOrders.stream()
                .map(SaleOrder::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 当月回款总额 = Σ(当月 payment_record.pay_amount)
        LambdaQueryWrapper<PaymentRecord> paymentWrapper = new LambdaQueryWrapper<>();
        paymentWrapper.ge(PaymentRecord::getPayDate, monthStart);
        paymentWrapper.lt(PaymentRecord::getPayDate, monthEnd);
        List<PaymentRecord> monthPayments = paymentRecordMapper.selectList(paymentWrapper);
        BigDecimal monthPaymentAmount = monthPayments.stream()
                .map(PaymentRecord::getPayAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 应收账款余额 = 订单总额 - 已回款总额（历史累计）
        LambdaQueryWrapper<SaleOrder> allOrderWrapper = new LambdaQueryWrapper<>();
        allOrderWrapper.ne(SaleOrder::getStatus, "DRAFT");
        allOrderWrapper.ne(SaleOrder::getStatus, "CANCELLED");
        List<SaleOrder> allOrders = saleOrderMapper.selectList(allOrderWrapper);
        BigDecimal totalOrderAmount = allOrders.stream()
                .map(SaleOrder::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalReceivedAmount = allOrders.stream()
                .map(SaleOrder::getReceivedAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal receivableBalance = totalOrderAmount.subtract(totalReceivedAmount);

        // 回款率 = 已回款 / 订单总额 × 100%
        BigDecimal paymentRate = BigDecimal.ZERO;
        if (monthOrderAmount.compareTo(BigDecimal.ZERO) > 0) {
            paymentRate = monthPaymentAmount.multiply(new BigDecimal("100"))
                    .divide(monthOrderAmount, 2, RoundingMode.HALF_UP);
        }

        // 当月完工数量 = Σ(当月完工工单的 qualified_qty)
        LocalDateTime monthStartTime = monthStart.atStartOfDay();
        LocalDateTime monthEndTime = monthEnd.atStartOfDay();
        LambdaQueryWrapper<ProdOrder> finishedWrapper = new LambdaQueryWrapper<>();
        finishedWrapper.ge(ProdOrder::getActualEnd, monthStartTime);
        finishedWrapper.lt(ProdOrder::getActualEnd, monthEndTime);
        finishedWrapper.eq(ProdOrder::getStatus, "FINISHED");
        List<ProdOrder> finishedOrders = prodOrderMapper.selectList(finishedWrapper);
        int monthCompletedQty = finishedOrders.stream()
                .mapToInt(o -> o.getQualifiedQty() != null ? o.getQualifiedQty() : 0)
                .sum();

        // 当月不良率 = 总不良数 / 总产量 × 100%
        LambdaQueryWrapper<ProdOrder> runningWrapper = new LambdaQueryWrapper<>();
        runningWrapper.ge(ProdOrder::getCreatedAt, monthStartTime);
        runningWrapper.lt(ProdOrder::getCreatedAt, monthEndTime);
        List<ProdOrder> monthProdOrders = prodOrderMapper.selectList(runningWrapper);
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

        // 当月工资总额 = Σ(当月 salary_daily.total_amount)
        LambdaQueryWrapper<SalaryDaily> salaryWrapper = new LambdaQueryWrapper<>();
        salaryWrapper.ge(SalaryDaily::getWorkDate, monthStart);
        salaryWrapper.lt(SalaryDaily::getWorkDate, monthEnd);
        List<SalaryDaily> monthSalaryList = salaryDailyMapper.selectList(salaryWrapper);
        BigDecimal monthSalaryTotal = monthSalaryList.stream()
                .map(SalaryDaily::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 当月费用总额 = Σ(当月 expense_record.amount)
        LambdaQueryWrapper<ExpenseRecord> expenseWrapper = new LambdaQueryWrapper<>();
        expenseWrapper.ge(ExpenseRecord::getExpenseDate, monthStart);
        expenseWrapper.lt(ExpenseRecord::getExpenseDate, monthEnd);
        List<ExpenseRecord> monthExpenses = expenseRecordMapper.selectList(expenseWrapper);
        BigDecimal monthExpenseTotal = monthExpenses.stream()
                .map(ExpenseRecord::getAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 当月毛利润 = 回款总额 - 原料成本 - 工资 - 费用
        // 原料成本：从完工工单的rawMaterialQty * 产品重量 * 原料单价（简化为0，实际需查原料单价）
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

        // OEE（设备综合效率）- 取所有机台当日OEE平均值
        BigDecimal oee = calculateAverageOee(LocalDate.now());

        // 构建响应
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
        response.setOee(oee);

        return R.ok(response);
    }

    /**
     * 生产看板数据（严格按技术文档11.3节）
     */
    public R<DashboardProductionResponse> productionDashboard() {
        DashboardProductionResponse response = new DashboardProductionResponse();

        // 各机台实时状态（运行/空闲/维修）
        List<Machine> machines = machineMapper.selectList(null);
        List<DashboardProductionResponse.MachineStatus> machineStatuses = new ArrayList<>();
        for (Machine machine : machines) {
            DashboardProductionResponse.MachineStatus ms = new DashboardProductionResponse.MachineStatus();
            ms.setMachineId(machine.getId());
            ms.setMachineName(machine.getName());
            ms.setStatus(machine.getStatus());

            // 查询当前机台正在生产的工单
            LambdaQueryWrapper<ProdOrder> orderWrapper = new LambdaQueryWrapper<>();
            orderWrapper.eq(ProdOrder::getMachineId, machine.getId());
            orderWrapper.eq(ProdOrder::getStatus, "RUNNING");
            orderWrapper.last("LIMIT 1");
            ProdOrder currentOrder = prodOrderMapper.selectOne(orderWrapper);
            if (currentOrder != null) {
                ms.setOrderNo(currentOrder.getOrderNo());
                if (currentOrder.getProductId() != null) {
                    Product product = productMapper.selectById(currentOrder.getProductId());
                    if (product != null) {
                        ms.setProductName(product.getName());
                    }
                }
            }
            machineStatuses.add(ms);
        }
        response.setMachineStatuses(machineStatuses);

        // 各工单完成百分比 = qualified_qty / plan_qty
        LambdaQueryWrapper<ProdOrder> progressWrapper = new LambdaQueryWrapper<>();
        progressWrapper.in(ProdOrder::getStatus, "SCHEDULED", "RUNNING", "PAUSED");
        progressWrapper.orderByDesc(ProdOrder::getPriority);
        List<ProdOrder> activeOrders = prodOrderMapper.selectList(progressWrapper);
        List<DashboardProductionResponse.OrderProgress> orderProgresses = new ArrayList<>();
        for (ProdOrder order : activeOrders) {
            DashboardProductionResponse.OrderProgress op = new DashboardProductionResponse.OrderProgress();
            op.setOrderId(order.getId());
            op.setOrderNo(order.getOrderNo());
            op.setPlanQty(order.getPlanQty());
            op.setCompletedQty(order.getQualifiedQty() != null ? order.getQualifiedQty() : 0);
            op.setStatus(order.getStatus());

            // 计算完成率
            BigDecimal completionRate = BigDecimal.ZERO;
            if (order.getPlanQty() != null && order.getPlanQty() > 0) {
                int qualifiedQty = order.getQualifiedQty() != null ? order.getQualifiedQty() : 0;
                completionRate = new BigDecimal(qualifiedQty).multiply(new BigDecimal("100"))
                        .divide(new BigDecimal(order.getPlanQty()), 2, RoundingMode.HALF_UP);
            }
            op.setCompletionRate(completionRate);

            // 产品名称
            if (order.getProductId() != null) {
                Product product = productMapper.selectById(order.getProductId());
                if (product != null) {
                    op.setProductName(product.getName());
                }
            }
            orderProgresses.add(op);
        }
        response.setOrderProgresses(orderProgresses);

        // 当日各班次产量
        LocalDateTime dayStart = LocalDate.now().atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);
        LambdaQueryWrapper<ProdReport> reportWrapper = new LambdaQueryWrapper<>();
        reportWrapper.ge(ProdReport::getCreatedAt, dayStart);
        reportWrapper.lt(ProdReport::getCreatedAt, dayEnd);
        List<ProdReport> todayReports = prodReportMapper.selectList(reportWrapper);

        // 按班次分组统计
        Map<String, Integer> shiftQtyMap = new LinkedHashMap<>();
        Map<String, Integer> shiftBadQtyMap = new LinkedHashMap<>();
        for (ProdReport report : todayReports) {
            String shift = report.getShift() != null ? report.getShift() : "UNKNOWN";
            int qty = report.getQty() != null ? report.getQty() : 0;
            int badQty = report.getBadQty() != null ? report.getBadQty() : 0;
            shiftQtyMap.merge(shift, qty, Integer::sum);
            shiftBadQtyMap.merge(shift, badQty, Integer::sum);
        }

        List<DashboardProductionResponse.ShiftOutput> shiftOutputs = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : shiftQtyMap.entrySet()) {
            DashboardProductionResponse.ShiftOutput so = new DashboardProductionResponse.ShiftOutput();
            so.setShift(entry.getKey());
            so.setQty(entry.getValue());
            so.setBadQty(shiftBadQtyMap.getOrDefault(entry.getKey(), 0));
            shiftOutputs.add(so);
        }
        response.setShiftOutputs(shiftOutputs);

        // 当日不良TOP5缺陷
        LambdaQueryWrapper<QcRecord> qcWrapper = new LambdaQueryWrapper<>();
        qcWrapper.ge(QcRecord::getCheckTime, dayStart);
        qcWrapper.lt(QcRecord::getCheckTime, dayEnd);
        qcWrapper.eq(QcRecord::getCheckResult, "FAIL");
        qcWrapper.isNotNull(QcRecord::getDefectType);
        List<QcRecord> failQcRecords = qcRecordMapper.selectList(qcWrapper);

        // 按缺陷类型分组统计
        Map<String, Integer> defectMap = failQcRecords.stream()
                .collect(Collectors.groupingBy(
                        r -> r.getDefectType() != null ? r.getDefectType() : "未知",
                        Collectors.summingInt(r -> r.getDefectQty() != null ? r.getDefectQty() : 1)
                ));

        List<DashboardProductionResponse.TopDefect> topDefects = defectMap.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(5)
                .map(entry -> {
                    DashboardProductionResponse.TopDefect td = new DashboardProductionResponse.TopDefect();
                    td.setDefectType(entry.getKey());
                    td.setQty(entry.getValue());
                    return td;
                })
                .collect(Collectors.toList());
        response.setTopDefects(topDefects);

        return R.ok(response);
    }

    /**
     * 品质看板数据
     */
    public R<DashboardQualityResponse> qualityDashboard() {
        DashboardQualityResponse response = new DashboardQualityResponse();

        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.plusMonths(1).atDay(1);
        LocalDateTime monthStartTime = monthStart.atStartOfDay();
        LocalDateTime monthEndTime = monthEnd.atStartOfDay();

        // 当月质检记录
        LambdaQueryWrapper<QcRecord> qcWrapper = new LambdaQueryWrapper<>();
        qcWrapper.ge(QcRecord::getCheckTime, monthStartTime);
        qcWrapper.lt(QcRecord::getCheckTime, monthEndTime);
        List<QcRecord> monthQcRecords = qcRecordMapper.selectList(qcWrapper);

        // 总检验数、合格数、不合格数、合格率
        int totalCheckQty = monthQcRecords.stream()
                .mapToInt(r -> r.getSampleQty() != null ? r.getSampleQty() : 1)
                .sum();
        long passCount = monthQcRecords.stream()
                .filter(r -> "PASS".equals(r.getCheckResult()))
                .count();
        long failCount = monthQcRecords.stream()
                .filter(r -> "FAIL".equals(r.getCheckResult()))
                .count();
        int passQty = (int) passCount;
        int failQty = (int) failCount;
        BigDecimal passRate = BigDecimal.ZERO;
        if (totalCheckQty > 0) {
            passRate = new BigDecimal(passQty).multiply(new BigDecimal("100"))
                    .divide(new BigDecimal(totalCheckQty), 2, RoundingMode.HALF_UP);
        }

        response.setTotalCheckQty(totalCheckQty);
        response.setPassQty(passQty);
        response.setFailQty(failQty);
        response.setPassRate(passRate);

        // TOP缺陷类型
        Map<String, Integer> defectMap = monthQcRecords.stream()
                .filter(r -> "FAIL".equals(r.getCheckResult()) && r.getDefectType() != null)
                .collect(Collectors.groupingBy(
                        QcRecord::getDefectType,
                        Collectors.summingInt(r -> r.getDefectQty() != null ? r.getDefectQty() : 1)
                ));

        List<DashboardQualityResponse.TopDefect> topDefects = defectMap.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(10)
                .map(entry -> {
                    DashboardQualityResponse.TopDefect td = new DashboardQualityResponse.TopDefect();
                    td.setDefectType(entry.getKey());
                    td.setQty(entry.getValue());
                    return td;
                })
                .collect(Collectors.toList());
        response.setTopDefects(topDefects);

        // 不良率趋势（按日统计当月数据）
        List<DashboardQualityResponse.TrendData> trendData = new ArrayList<>();
        for (int day = 1; day <= currentMonth.lengthOfMonth(); day++) {
            LocalDate date = currentMonth.atDay(day);
            if (date.isAfter(LocalDate.now())) {
                break;
            }
            LocalDateTime dayStartTime = date.atStartOfDay();
            LocalDateTime dayEndTime = date.plusDays(1).atStartOfDay();

            LambdaQueryWrapper<QcRecord> dayQcWrapper = new LambdaQueryWrapper<>();
            dayQcWrapper.ge(QcRecord::getCheckTime, dayStartTime);
            dayQcWrapper.lt(QcRecord::getCheckTime, dayEndTime);
            List<QcRecord> dayQcRecords = qcRecordMapper.selectList(dayQcWrapper);

            int dayCheckQty = dayQcRecords.stream()
                    .mapToInt(r -> r.getSampleQty() != null ? r.getSampleQty() : 1)
                    .sum();
            int dayPassQty = (int) dayQcRecords.stream()
                    .filter(r -> "PASS".equals(r.getCheckResult()))
                    .count();
            int dayFailQty = (int) dayQcRecords.stream()
                    .filter(r -> "FAIL".equals(r.getCheckResult()))
                    .count();
            BigDecimal dayPassRate = BigDecimal.ZERO;
            if (dayCheckQty > 0) {
                dayPassRate = new BigDecimal(dayPassQty).multiply(new BigDecimal("100"))
                        .divide(new BigDecimal(dayCheckQty), 2, RoundingMode.HALF_UP);
            }

            DashboardQualityResponse.TrendData td = new DashboardQualityResponse.TrendData();
            td.setDate(date.toString());
            td.setCheckQty(dayCheckQty);
            td.setPassQty(dayPassQty);
            td.setFailQty(dayFailQty);
            td.setPassRate(dayPassRate);
            trendData.add(td);
        }
        response.setTrendData(trendData);

        return R.ok(response);
    }

    /**
     * OEE统计（严格按技术文档11.2节）
     *
     * @param machineId 机台ID（为空则取所有机台平均值）
     * @param date      统计日期
     */
    public R<OeeResponse> oeeStats(Long machineId, LocalDate date) {
        if (date == null) {
            date = LocalDate.now();
        }

        if (machineId != null) {
            // 单台OEE
            OeeResponse oee = calculateOee(machineId, date);
            return R.ok(oee);
        } else {
            // 所有机台平均OEE
            BigDecimal avgOee = calculateAverageOee(date);
            OeeResponse response = new OeeResponse();
            response.setTimeAvailability(null);
            response.setPerformanceRate(null);
            response.setQualityRate(null);
            response.setOee(avgOee);
            return R.ok(response);
        }
    }

    /**
     * 计算单台OEE
     * OEE = 时间开动率 × 性能开动率 × 合格品率
     */
    private OeeResponse calculateOee(Long machineId, LocalDate date) {
        OeeResponse response = new OeeResponse();

        LocalDateTime dayStart = date.atStartOfDay();
        LocalDateTime dayEnd = date.plusDays(1).atStartOfDay();

        // === 时间开动率 = 实际运行时间 / 计划运行时间 ===
        // 计划运行时间 = 班次总时长 - 计划停机（换模、保养/休息）
        // 班次总时长：白班8小时 + 夜班8小时 = 16小时 = 960分钟
        int shiftTotalMinutes = 960;

        // 查询当日该机台的停机记录
        LambdaQueryWrapper<DowntimeRecord> downtimeWrapper = new LambdaQueryWrapper<>();
        downtimeWrapper.eq(DowntimeRecord::getMachineId, machineId);
        downtimeWrapper.ge(DowntimeRecord::getStartTime, dayStart);
        downtimeWrapper.lt(DowntimeRecord::getStartTime, dayEnd);
        List<DowntimeRecord> downtimeRecords = downtimeRecordMapper.selectList(downtimeWrapper);

        // 计划停机（换模、休息）
        int plannedDowntimeMinutes = downtimeRecords.stream()
                .filter(r -> "MOLD_CHANGE".equals(r.getReason()) || "BREAK".equals(r.getReason()))
                .mapToInt(r -> r.getDurationMinutes() != null ? r.getDurationMinutes() : 0)
                .sum();

        // 非计划停机（缺料、品质问题、设备故障、其他）
        int unplannedDowntimeMinutes = downtimeRecords.stream()
                .filter(r -> !"MOLD_CHANGE".equals(r.getReason()) && !"BREAK".equals(r.getReason()))
                .mapToInt(r -> r.getDurationMinutes() != null ? r.getDurationMinutes() : 0)
                .sum();

        // 计划运行时间 = 班次总时长 - 计划停机
        int plannedRunMinutes = shiftTotalMinutes - plannedDowntimeMinutes;
        // 实际运行时间 = 计划运行时间 - 非计划停机
        int actualRunMinutes = plannedRunMinutes - unplannedDowntimeMinutes;
        if (actualRunMinutes < 0) {
            actualRunMinutes = 0;
        }

        BigDecimal timeAvailability = BigDecimal.ZERO;
        if (plannedRunMinutes > 0) {
            timeAvailability = new BigDecimal(actualRunMinutes)
                    .divide(new BigDecimal(plannedRunMinutes), 4, RoundingMode.HALF_UP);
        }

        // === 性能开动率 = 实际产量 / 理论产量 ===
        // 理论产量 = 实际运行时间(秒) / 标准周期(秒) × 穴数
        // 查询当日该机台的报工记录
        LambdaQueryWrapper<ProdReport> reportWrapper = new LambdaQueryWrapper<>();
        reportWrapper.eq(ProdReport::getMachineId, machineId);
        reportWrapper.ge(ProdReport::getCreatedAt, dayStart);
        reportWrapper.lt(ProdReport::getCreatedAt, dayEnd);
        List<ProdReport> dayReports = prodReportMapper.selectList(reportWrapper);

        int actualOutput = dayReports.stream()
                .mapToInt(r -> r.getQty() != null ? r.getQty() : 0)
                .sum();

        // 获取产品的标准周期和穴数
        int theoreticalOutput = 0;
        LambdaQueryWrapper<ProdOrder> orderWrapper = new LambdaQueryWrapper<>();
        orderWrapper.eq(ProdOrder::getMachineId, machineId);
        orderWrapper.in(ProdOrder::getStatus, "RUNNING", "FINISHED");
        List<ProdOrder> machineOrders = prodOrderMapper.selectList(orderWrapper);

        if (!machineOrders.isEmpty() && actualRunMinutes > 0) {
            ProdOrder order = machineOrders.get(0);
            if (order.getProductId() != null) {
                Product product = productMapper.selectById(order.getProductId());
                if (product != null) {
                    int cycleTimeSec = product.getCycleTimeSec() != null ? product.getCycleTimeSec() : 1;
                    int cavityYield = product.getCavityYield() != null ? product.getCavityYield() : 1;
                    // 理论产量 = 实际运行时间(秒) / 标准周期(秒) × 穴数
                    theoreticalOutput = (actualRunMinutes * 60) / cycleTimeSec * cavityYield;
                }
            }
        }

        BigDecimal performanceRate = BigDecimal.ZERO;
        if (theoreticalOutput > 0) {
            performanceRate = new BigDecimal(actualOutput)
                    .divide(new BigDecimal(theoreticalOutput), 4, RoundingMode.HALF_UP);
        }

        // === 合格品率 = 合格品数量 / 总产量 × 100% ===
        int totalBadQty = dayReports.stream()
                .mapToInt(r -> r.getBadQty() != null ? r.getBadQty() : 0)
                .sum();
        BigDecimal qualityRate = BigDecimal.ONE;
        if (actualOutput > 0) {
            qualityRate = new BigDecimal(actualOutput - totalBadQty)
                    .divide(new BigDecimal(actualOutput), 4, RoundingMode.HALF_UP);
        }

        // === OEE = 时间开动率 × 性能开动率 × 合格品率 ===
        BigDecimal oee = timeAvailability.multiply(performanceRate).multiply(qualityRate)
                .multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP);

        response.setTimeAvailability(timeAvailability.multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP));
        response.setPerformanceRate(performanceRate.multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP));
        response.setQualityRate(qualityRate.multiply(new BigDecimal("100")).setScale(2, RoundingMode.HALF_UP));
        response.setOee(oee);

        return response;
    }

    /**
     * 计算所有机台当日OEE平均值
     */
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
