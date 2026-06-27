package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdReportRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdReportResponse;
import com.injectmes.entity.Machine;
import com.injectmes.entity.Mold;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.ProdReport;
import com.injectmes.entity.Product;
import com.injectmes.entity.SysUser;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.enums.ReportType;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import com.injectmes.security.LoginUserDetails;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 生产报工服务
 */
@Service
public class ProdReportService {

    @Autowired
    private ProdReportMapper prodReportMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private MoldMapper moldMapper;

    @Autowired
    private MachineMapper machineMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 报工（核心业务）
     * - 校验工单状态必须是RUNNING
     * - 校验报工数量不超过计划数量×1.05（容差5%）
     * - START类型：记录开工
     * - OUTPUT类型：记录产量，更新工单completed_qty/bad_qty，累加模具used_shots
     * - END类型：记录完工
     * - 自动计算work_minutes
     *
     * @param request 报工请求
     * @return 报工响应
     */
    @Transactional
    public R<ProdReportResponse> report(ProdReportRequest request) {
        // 1. 校验工单存在
        ProdOrder order = prodOrderMapper.selectById(request.getProdOrderId());
        if (order == null) {
            throw new BusinessException("生产工单不存在");
        }

        Machine machine = machineMapper.selectById(request.getMachineId());
        if (machine == null) {
            throw new BusinessException("注塑机不存在");
        }
        if (order.getMachineId() != null && !order.getMachineId().equals(machine.getId())) {
            throw new BusinessException("报工机台与工单不一致");
        }

        // 2. 校验工单状态必须是RUNNING（生产中）
        if (!ProdOrderStatus.RUNNING.name().equals(order.getStatus())) {
            throw new BusinessException("工单状态不是生产中，无法报工");
        }

        // 3. 校验报工数量不超过计划数量×1.05（容差5%）
        int planQty = order.getPlanQty() != null ? order.getPlanQty() : 0;
        int planQtyWithTolerance = (int) Math.ceil(planQty * 1.05);
        int currentCompleted = order.getCompletedQty() != null ? order.getCompletedQty() : 0;
        int reportQty = request.getQty() != null ? request.getQty() : 0;
        if (currentCompleted + reportQty > planQtyWithTolerance) {
            throw new BusinessException("报工数量超出计划数量容差范围（容差5%），当前已完成："
                    + currentCompleted + "，计划数量：" + planQty
                    + "，容差上限：" + planQtyWithTolerance);
        }

        // 4. 构建报工记录
        ProdReport prodReport = new ProdReport();
        BeanUtils.copyProperties(request, prodReport);
        prodReport.setUserId(resolveCurrentUserId());
        prodReport.setMachineId(machine.getId());
        prodReport.setCreatedAt(LocalDateTime.now());

        // 5. 根据报工类型处理
        String reportType = request.getReportType();
        if (ReportType.START.name().equals(reportType)) {
            // START类型：记录开工，更新工单实际开始时间
            if (order.getActualStart() == null) {
                order.setActualStart(LocalDateTime.now());
                order.setUpdatedAt(LocalDateTime.now());
                prodOrderMapper.updateById(order);
            }
        } else if (ReportType.OUTPUT.name().equals(reportType)) {
            // OUTPUT类型：记录产量，更新工单completed_qty/bad_qty，累加模具used_shots
            // 更新工单完成数量
            int newCompletedQty = currentCompleted + reportQty;
            order.setCompletedQty(newCompletedQty);

            // 更新工单不良数量
            int reportBadQty = request.getBadQty() != null ? request.getBadQty() : 0;
            int currentBadQty = order.getBadQty() != null ? order.getBadQty() : 0;
            order.setBadQty(currentBadQty + reportBadQty);
            order.setUpdatedAt(LocalDateTime.now());

            prodOrderMapper.updateById(order);

            // 累加模具模次
            if (request.getMoldId() != null && request.getShots() != null && request.getShots() > 0) {
                moldMapper.update(null, new LambdaUpdateWrapper<Mold>()
                        .eq(Mold::getId, request.getMoldId())
                        .setSql("used_shots = COALESCE(used_shots, 0) + " + request.getShots()
                                + ", shots_since_maintenance = COALESCE(shots_since_maintenance, 0) + " + request.getShots()));
            }
        } else if (ReportType.END.name().equals(reportType)) {
            // END类型：记录完工，更新工单实际结束时间和状态
            order.setActualEnd(LocalDateTime.now());
            order.setStatus(ProdOrderStatus.FINISHED.name());
            order.setUpdatedAt(LocalDateTime.now());
            prodOrderMapper.updateById(order);
        }

        // 6. 自动计算work_minutes
        if (request.getStartTime() != null && request.getEndTime() != null) {
            long minutes = Duration.between(request.getStartTime(), request.getEndTime()).toMinutes();
            prodReport.setWorkMinutes((int) minutes);
        }

        // 7. 插入报工记录
        prodReportMapper.insert(prodReport);

        return R.ok("报工成功", convertToResponse(prodReport));
    }

    /**
     * 当前班次任务
     */
    public R<List<java.util.Map<String, Object>>> currentShiftTasks() {
        LambdaQueryWrapper<ProdOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(ProdOrder::getStatus,
                        ProdOrderStatus.SCHEDULED.name(),
                        ProdOrderStatus.RUNNING.name(),
                        ProdOrderStatus.PAUSED.name())
                .orderByAsc(ProdOrder::getPlanStart)
                .orderByDesc(ProdOrder::getCreatedAt);

        List<java.util.Map<String, Object>> result = prodOrderMapper.selectList(wrapper)
                .stream()
                .map(this::toTaskMap)
                .collect(Collectors.toList());
        return R.ok(result);
    }

    /**
     * 根据机台编号获取工单
     */
    public R<List<java.util.Map<String, Object>>> workOrdersByMachineCode(String machineCode) {
        Machine machine = resolveMachine(machineCode);
        if (machine == null) {
            return R.ok(List.of());
        }

        LambdaQueryWrapper<ProdOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProdOrder::getMachineId, machine.getId())
                .in(ProdOrder::getStatus,
                        ProdOrderStatus.SCHEDULED.name(),
                        ProdOrderStatus.RUNNING.name(),
                        ProdOrderStatus.PAUSED.name())
                .orderByAsc(ProdOrder::getPlanStart)
                .orderByDesc(ProdOrder::getCreatedAt);

        List<java.util.Map<String, Object>> result = prodOrderMapper.selectList(wrapper)
                .stream()
                .map(this::toTaskMap)
                .collect(Collectors.toList());
        return R.ok(result);
    }

    /**
     * 当日产量汇总（按工单分组）
     *
     * @return 当日报工响应列表
     */
    public R<List<ProdReportResponse>> todaySummary() {
        LocalDateTime startOfDay = LocalDate.now().atStartOfDay();
        LocalDateTime endOfDay = startOfDay.plusDays(1);

        LambdaQueryWrapper<ProdReport> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(ProdReport::getCreatedAt, startOfDay)
                .lt(ProdReport::getCreatedAt, endOfDay)
                .orderByDesc(ProdReport::getCreatedAt);

        List<ProdReport> reports = prodReportMapper.selectList(wrapper);

        List<ProdReportResponse> responses = reports.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        return R.ok(responses);
    }

    /**
     * 我的报工记录（当前用户，分页）
     *
     * @param request   分页请求
     * @param userId    当前用户ID
     * @return 分页响应
     */
    public R<PageResponse<ProdReportResponse>> myReports(PageRequest request, Long userId) {
        Page<ProdReport> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<ProdReport> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProdReport::getUserId, userId);
        applyDateScope(wrapper, request.getType(), request.getStartDate(), request.getEndDate());

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            // 按工单编号搜索需要关联查询，此处简化为按ID匹配
            wrapper.and(w -> w.like(ProdReport::getReportType, keyword));
        }

        // 按创建时间降序
        wrapper.orderByDesc(ProdReport::getCreatedAt);

        Page<ProdReport> result = prodReportMapper.selectPage(page, wrapper);

        List<ProdReportResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<ProdReportResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    public R<java.util.Map<String, Object>> myOutputStats(Long userId, String type) {
        List<ProdReport> reports = queryUserReports(userId, type);
        int totalQty = 0;
        int totalDefect = 0;
        for (ProdReport report : reports) {
            totalQty += report.getQty() != null ? report.getQty() : 0;
            totalDefect += report.getBadQty() != null ? report.getBadQty() : 0;
        }
        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("totalQuantity", totalQty);
        result.put("totalDefect", totalDefect);
        result.put("reportCount", reports.size());
        result.put("type", type);
        return R.ok(result);
    }

    private Long resolveCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUserDetails userDetails) {
            return userDetails.getUserId();
        }
        return null;
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

        Machine machine = machineMapper.selectOne(
                new LambdaQueryWrapper<Machine>().eq(Machine::getCode, normalized)
        );
        if (machine != null) {
            return machine;
        }

        return machineMapper.selectOne(
                new LambdaQueryWrapper<Machine>().eq(Machine::getQrCode, machineCode.trim())
        );
    }

    private java.util.Map<String, Object> toTaskMap(ProdOrder order) {
        java.util.Map<String, Object> row = new java.util.HashMap<>();
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

        if (order.getMachineId() != null) {
            Machine machine = machineMapper.selectById(order.getMachineId());
            if (machine != null) {
                row.put("machineCode", machine.getCode());
                row.put("machineName", machine.getName());
            }
        }

        return row;
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

    /**
     * 报工记录列表（全部，分页）
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<ProdReportResponse>> list(PageRequest request) {
        Page<ProdReport> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<ProdReport> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(ProdReport::getReportType, keyword)
                    .or().like(ProdReport::getShift, keyword)
            );
        }

        // 按创建时间降序
        wrapper.orderByDesc(ProdReport::getCreatedAt);

        Page<ProdReport> result = prodReportMapper.selectPage(page, wrapper);

        List<ProdReportResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<ProdReportResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 实体转响应DTO
     */
    private ProdReportResponse convertToResponse(ProdReport prodReport) {
        ProdReportResponse response = new ProdReportResponse();
        BeanUtils.copyProperties(prodReport, response);

        // 填充工单编号
        if (prodReport.getProdOrderId() != null) {
            ProdOrder order = prodOrderMapper.selectById(prodReport.getProdOrderId());
            if (order != null) {
                response.setOrderNo(order.getOrderNo());
            }
        }

        // 填充注塑机名称
        if (prodReport.getMachineId() != null) {
            Machine machine = machineMapper.selectById(prodReport.getMachineId());
            if (machine != null) {
                response.setMachineName(machine.getName());
            }
        }

        // 填充模具名称
        if (prodReport.getMoldId() != null) {
            Mold mold = moldMapper.selectById(prodReport.getMoldId());
            if (mold != null) {
                response.setMoldName(mold.getName());
            }
        }

        // 填充报工人姓名
        if (prodReport.getUserId() != null) {
            SysUser user = sysUserMapper.selectById(prodReport.getUserId());
            if (user != null) {
                response.setReporterName(user.getRealName());
            }
        }

        return response;
    }
}
