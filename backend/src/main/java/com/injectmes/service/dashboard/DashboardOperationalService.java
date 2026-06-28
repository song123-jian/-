package com.injectmes.service.dashboard;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
import com.injectmes.dto.resp.DashboardProductionResponse;
import com.injectmes.dto.resp.DashboardQualityResponse;
import com.injectmes.dto.resp.OeeResponse;
import com.injectmes.entity.DowntimeRecord;
import com.injectmes.entity.Machine;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.ProdReport;
import com.injectmes.entity.Product;
import com.injectmes.entity.QcRecord;
import com.injectmes.mapper.DowntimeRecordMapper;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.QcRecordMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class DashboardOperationalService {

    @Autowired
    private MachineMapper machineMapper;
    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private ProdReportMapper prodReportMapper;
    @Autowired
    private QcRecordMapper qcRecordMapper;
    @Autowired
    private DowntimeRecordMapper downtimeRecordMapper;
    @Autowired
    private ProductMapper productMapper;

    public R<DashboardProductionResponse> productionDashboard() {
        DashboardProductionResponse response = new DashboardProductionResponse();

        List<Machine> machines = machineMapper.selectList(null);
        List<DashboardProductionResponse.MachineStatus> machineStatuses = new ArrayList<>();
        for (Machine machine : machines) {
            DashboardProductionResponse.MachineStatus ms = new DashboardProductionResponse.MachineStatus();
            ms.setMachineId(machine.getId());
            ms.setMachineName(machine.getName());
            ms.setStatus(machine.getStatus());

            ProdOrder currentOrder = prodOrderMapper.selectOne(new LambdaQueryWrapper<ProdOrder>()
                    .eq(ProdOrder::getMachineId, machine.getId())
                    .eq(ProdOrder::getStatus, "RUNNING")
                    .last("LIMIT 1"));
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

        List<ProdOrder> activeOrders = prodOrderMapper.selectList(new LambdaQueryWrapper<ProdOrder>()
                .in(ProdOrder::getStatus, "SCHEDULED", "RUNNING", "PAUSED")
                .orderByDesc(ProdOrder::getPriority));
        List<DashboardProductionResponse.OrderProgress> orderProgresses = new ArrayList<>();
        for (ProdOrder order : activeOrders) {
            DashboardProductionResponse.OrderProgress op = new DashboardProductionResponse.OrderProgress();
            op.setOrderId(order.getId());
            op.setOrderNo(order.getOrderNo());
            op.setPlanQty(order.getPlanQty());
            op.setCompletedQty(order.getQualifiedQty() != null ? order.getQualifiedQty() : 0);
            op.setStatus(order.getStatus());

            BigDecimal completionRate = BigDecimal.ZERO;
            if (order.getPlanQty() != null && order.getPlanQty() > 0) {
                int qualifiedQty = order.getQualifiedQty() != null ? order.getQualifiedQty() : 0;
                completionRate = new BigDecimal(qualifiedQty).multiply(new BigDecimal("100"))
                        .divide(new BigDecimal(order.getPlanQty()), 2, RoundingMode.HALF_UP);
            }
            op.setCompletionRate(completionRate);

            if (order.getProductId() != null) {
                Product product = productMapper.selectById(order.getProductId());
                if (product != null) {
                    op.setProductName(product.getName());
                }
            }
            orderProgresses.add(op);
        }
        response.setOrderProgresses(orderProgresses);

        LocalDateTime dayStart = LocalDate.now().atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);
        List<ProdReport> todayReports = prodReportMapper.selectList(new LambdaQueryWrapper<ProdReport>()
                .ge(ProdReport::getCreatedAt, dayStart)
                .lt(ProdReport::getCreatedAt, dayEnd));

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

        List<QcRecord> failQcRecords = qcRecordMapper.selectList(new LambdaQueryWrapper<QcRecord>()
                .ge(QcRecord::getCheckTime, dayStart)
                .lt(QcRecord::getCheckTime, dayEnd)
                .eq(QcRecord::getCheckResult, "FAIL")
                .isNotNull(QcRecord::getDefectType));

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

    public R<DashboardQualityResponse> qualityDashboard() {
        DashboardQualityResponse response = new DashboardQualityResponse();

        YearMonth currentMonth = YearMonth.now();
        LocalDate monthStart = currentMonth.atDay(1);
        LocalDate monthEnd = currentMonth.plusMonths(1).atDay(1);
        LocalDateTime monthStartTime = monthStart.atStartOfDay();
        LocalDateTime monthEndTime = monthEnd.atStartOfDay();

        List<QcRecord> monthQcRecords = qcRecordMapper.selectList(new LambdaQueryWrapper<QcRecord>()
                .ge(QcRecord::getCheckTime, monthStartTime)
                .lt(QcRecord::getCheckTime, monthEndTime));

        int totalCheckQty = monthQcRecords.stream()
                .mapToInt(r -> r.getSampleQty() != null ? r.getSampleQty() : 1)
                .sum();
        long passCount = monthQcRecords.stream().filter(r -> "PASS".equals(r.getCheckResult())).count();
        long failCount = monthQcRecords.stream().filter(r -> "FAIL".equals(r.getCheckResult())).count();
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

        List<DashboardQualityResponse.TrendData> trendData = new ArrayList<>();
        for (int day = 1; day <= currentMonth.lengthOfMonth(); day++) {
            LocalDate date = currentMonth.atDay(day);
            if (date.isAfter(LocalDate.now())) {
                break;
            }
            LocalDateTime dayStartTime = date.atStartOfDay();
            LocalDateTime dayEndTime = date.plusDays(1).atStartOfDay();

            List<QcRecord> dayQcRecords = qcRecordMapper.selectList(new LambdaQueryWrapper<QcRecord>()
                    .ge(QcRecord::getCheckTime, dayStartTime)
                    .lt(QcRecord::getCheckTime, dayEndTime));

            int dayCheckQty = dayQcRecords.stream()
                    .mapToInt(r -> r.getSampleQty() != null ? r.getSampleQty() : 1)
                    .sum();
            int dayPassQty = (int) dayQcRecords.stream().filter(r -> "PASS".equals(r.getCheckResult())).count();
            int dayFailQty = (int) dayQcRecords.stream().filter(r -> "FAIL".equals(r.getCheckResult())).count();
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
