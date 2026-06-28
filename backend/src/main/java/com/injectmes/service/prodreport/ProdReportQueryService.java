package com.injectmes.service.prodreport;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdReportResponse;
import com.injectmes.entity.Machine;
import com.injectmes.entity.Mold;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.ProdReport;
import com.injectmes.entity.Product;
import com.injectmes.entity.SysUser;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ProdReportQueryService {

    @Autowired
    private ProdReportMapper prodReportMapper;
    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private MachineMapper machineMapper;
    @Autowired
    private MoldMapper moldMapper;
    @Autowired
    private ProductMapper productMapper;
    @Autowired
    private SysUserMapper sysUserMapper;

    public R<PageResponse<ProdReportResponse>> list(PageRequest request,
                                                    String reportType,
                                                    String shift,
                                                    String startDate,
                                                    String endDate) {
        Page<ProdReport> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<ProdReport> wrapper = new LambdaQueryWrapper<>();

        if (reportType != null && !reportType.trim().isEmpty()) {
            wrapper.eq(ProdReport::getReportType, reportType.trim());
        }
        if (shift != null && !shift.trim().isEmpty()) {
            wrapper.eq(ProdReport::getShift, shift.trim());
        }
        applyCreatedAtRange(wrapper, startDate, endDate);

        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w.like(ProdReport::getReportType, keyword.trim())
                    .or().like(ProdReport::getShift, keyword.trim()));
        }

        wrapper.orderByDesc(ProdReport::getCreatedAt);
        Page<ProdReport> result = prodReportMapper.selectPage(page, wrapper);
        return toPageResponse(request, result);
    }

    public R<List<ProdReportResponse>> todaySummary() {
        LocalDateTime startOfDay = LocalDate.now().atStartOfDay();
        LocalDateTime endOfDay = startOfDay.plusDays(1);
        List<ProdReportResponse> responses = prodReportMapper.selectList(new LambdaQueryWrapper<ProdReport>()
                        .ge(ProdReport::getCreatedAt, startOfDay)
                        .lt(ProdReport::getCreatedAt, endOfDay)
                        .orderByDesc(ProdReport::getCreatedAt))
                .stream()
                .map(this::reportToResponse)
                .collect(Collectors.toList());
        return R.ok(responses);
    }

    public R<PageResponse<ProdReportResponse>> myReports(PageRequest request, Long userId) {
        Page<ProdReport> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<ProdReport> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProdReport::getUserId, userId);
        applyDateScope(wrapper, request.getType(), request.getStartDate(), request.getEndDate());

        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w.like(ProdReport::getReportType, keyword.trim()));
        }

        wrapper.orderByDesc(ProdReport::getCreatedAt);
        Page<ProdReport> result = prodReportMapper.selectPage(page, wrapper);
        return toPageResponse(request, result);
    }

    public R<List<Map<String, Object>>> currentShiftTasks() {
        List<Map<String, Object>> result = prodOrderMapper.selectList(new LambdaQueryWrapper<ProdOrder>()
                        .in(ProdOrder::getStatus,
                                ProdOrderStatus.SCHEDULED.name(),
                                ProdOrderStatus.RUNNING.name(),
                                ProdOrderStatus.PAUSED.name())
                        .orderByAsc(ProdOrder::getPlanStart)
                        .orderByDesc(ProdOrder::getCreatedAt))
                .stream()
                .map(this::toTaskMap)
                .collect(Collectors.toList());
        return R.ok(result);
    }

    public R<List<Map<String, Object>>> workOrdersByMachineCode(String machineCode) {
        Machine machine = resolveMachine(machineCode);
        if (machine == null) {
            return R.ok(List.of());
        }

        List<Map<String, Object>> result = prodOrderMapper.selectList(new LambdaQueryWrapper<ProdOrder>()
                        .eq(ProdOrder::getMachineId, machine.getId())
                        .in(ProdOrder::getStatus,
                                ProdOrderStatus.SCHEDULED.name(),
                                ProdOrderStatus.RUNNING.name(),
                                ProdOrderStatus.PAUSED.name())
                        .orderByAsc(ProdOrder::getPlanStart)
                        .orderByDesc(ProdOrder::getCreatedAt))
                .stream()
                .map(this::toTaskMap)
                .collect(Collectors.toList());
        return R.ok(result);
    }

    public R<Map<String, Object>> myOutputStats(Long userId, String type) {
        List<ProdReport> reports = queryUserReports(userId, type);
        int totalQty = 0;
        int totalDefect = 0;
        for (ProdReport report : reports) {
            totalQty += report.getQty() != null ? report.getQty() : 0;
            totalDefect += report.getBadQty() != null ? report.getBadQty() : 0;
        }
        Map<String, Object> result = new HashMap<>();
        result.put("totalQuantity", totalQty);
        result.put("totalDefect", totalDefect);
        result.put("reportCount", reports.size());
        result.put("type", type);
        return R.ok(result);
    }

    private R<PageResponse<ProdReportResponse>> toPageResponse(PageRequest request, Page<ProdReport> result) {
        List<ProdReportResponse> records = result.getRecords().stream()
                .map(this::reportToResponse)
                .collect(Collectors.toList());
        PageResponse<ProdReportResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());
        return R.ok(pageResponse);
    }

    private void applyDateScope(LambdaQueryWrapper<ProdReport> wrapper, String type, String startDate, String endDate) {
        if (startDate != null && !startDate.trim().isEmpty()) {
            wrapper.ge(ProdReport::getCreatedAt, LocalDate.parse(startDate).atStartOfDay());
            if (endDate != null && !endDate.trim().isEmpty()) {
                wrapper.lt(ProdReport::getCreatedAt, LocalDate.parse(endDate).plusDays(1).atStartOfDay());
            }
            return;
        }

        String scope = type != null ? type.trim().toLowerCase() : "";
        LocalDate today = LocalDate.now();
        if ("month".equals(scope)) {
            wrapper.ge(ProdReport::getCreatedAt, today.withDayOfMonth(1).atStartOfDay());
            wrapper.lt(ProdReport::getCreatedAt, today.withDayOfMonth(1).plusMonths(1).atStartOfDay());
        } else {
            wrapper.ge(ProdReport::getCreatedAt, today.atStartOfDay());
            wrapper.lt(ProdReport::getCreatedAt, today.plusDays(1).atStartOfDay());
        }
    }

    private void applyCreatedAtRange(LambdaQueryWrapper<ProdReport> wrapper, String startDate, String endDate) {
        if (startDate != null && !startDate.trim().isEmpty()) {
            wrapper.ge(ProdReport::getCreatedAt, LocalDate.parse(startDate.trim()).atStartOfDay());
        }
        if (endDate != null && !endDate.trim().isEmpty()) {
            wrapper.lt(ProdReport::getCreatedAt, LocalDate.parse(endDate.trim()).plusDays(1).atStartOfDay());
        }
    }

    private List<ProdReport> queryUserReports(Long userId, String type) {
        LambdaQueryWrapper<ProdReport> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProdReport::getUserId, userId);
        applyDateScope(wrapper, type, null, null);
        wrapper.orderByDesc(ProdReport::getCreatedAt);
        return prodReportMapper.selectList(wrapper);
    }

    private Machine resolveMachine(String machineCode) {
        if (machineCode == null || machineCode.trim().isEmpty()) {
            return null;
        }
        String normalized = machineCode.trim();
        if (normalized.startsWith("MACHINE:")) {
            normalized = normalized.substring("MACHINE:".length()).trim();
        }

        Machine machine = machineMapper.selectOne(new LambdaQueryWrapper<Machine>().eq(Machine::getCode, normalized));
        if (machine != null) {
            return machine;
        }
        return machineMapper.selectOne(new LambdaQueryWrapper<Machine>().eq(Machine::getQrCode, machineCode.trim()));
    }

    private Map<String, Object> toTaskMap(ProdOrder order) {
        Map<String, Object> row = new HashMap<>();
        row.put("workOrderId", order.getId());
        row.put("workOrderNo", order.getOrderNo());
        row.put("productId", order.getProductId());
        row.put("machineId", order.getMachineId());
        row.put("status", order.getStatus());
        row.put("planQty", order.getPlanQty());
        row.put("completedQty", order.getCompletedQty());
        row.put("qualifiedQty", order.getQualifiedQty());

        if (order.getProductId() != null) {
            Product product = productMapper.selectById(order.getProductId());
            if (product != null) {
                row.put("productName", product.getName());
            }
        }
        return row;
    }

    public ProdReportResponse reportToResponse(ProdReport prodReport) {
        ProdReportResponse response = new ProdReportResponse();
        BeanUtils.copyProperties(prodReport, response);

        if (prodReport.getProdOrderId() != null) {
            ProdOrder order = prodOrderMapper.selectById(prodReport.getProdOrderId());
            if (order != null) {
                response.setOrderNo(order.getOrderNo());
            }
        }
        if (prodReport.getMachineId() != null) {
            Machine machine = machineMapper.selectById(prodReport.getMachineId());
            if (machine != null) {
                response.setMachineName(machine.getName());
            }
        }
        if (prodReport.getMoldId() != null) {
            Mold mold = moldMapper.selectById(prodReport.getMoldId());
            if (mold != null) {
                response.setMoldName(mold.getName());
            }
        }
        if (prodReport.getUserId() != null) {
            SysUser user = sysUserMapper.selectById(prodReport.getUserId());
            if (user != null) {
                response.setReporterName(user.getRealName());
            }
        }
        return response;
    }
}
