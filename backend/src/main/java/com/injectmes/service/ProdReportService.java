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
import com.injectmes.entity.SysUser;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.enums.ReportType;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

        // 2. 校验工单状态必须是RUNNING（生产中）
        if (!ProdOrderStatus.RUNNING.name().equals(order.getStatus())) {
            throw new BusinessException("工单状态不是生产中，无法报工");
        }

        // 3. 校验报工数量不超过计划数量×1.05（容差5%）
        int planQtyWithTolerance = (int) Math.ceil(order.getPlanQty() * 1.05);
        int currentCompleted = order.getCompletedQty() != null ? order.getCompletedQty() : 0;
        int reportQty = request.getQty() != null ? request.getQty() : 0;
        if (currentCompleted + reportQty > planQtyWithTolerance) {
            throw new BusinessException("报工数量超出计划数量容差范围（容差5%），当前已完成："
                    + currentCompleted + "，计划数量：" + order.getPlanQty()
                    + "，容差上限：" + planQtyWithTolerance);
        }

        // 4. 构建报工记录
        ProdReport prodReport = new ProdReport();
        BeanUtils.copyProperties(request, prodReport);
        prodReport.setCreatedAt(LocalDateTime.now());

        // 5. 根据报工类型处理
        String reportType = request.getReportType();
        if (ReportType.START.name().equals(reportType)) {
            // START类型：记录开工，更新工单实际开始时间
            if (order.getActualStart() == null) {
                order.setActualStart(LocalDateTime.now());
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

            prodOrderMapper.updateById(order);

            // 累加模具模次
            if (request.getMoldId() != null && request.getShots() != null && request.getShots() > 0) {
                moldMapper.update(null, new LambdaUpdateWrapper<Mold>()
                        .eq(Mold::getId, request.getMoldId())
                        .setSql("used_shots = used_shots + " + request.getShots()));
            }
        } else if (ReportType.END.name().equals(reportType)) {
            // END类型：记录完工，更新工单实际结束时间和状态
            order.setActualEnd(LocalDateTime.now());
            order.setStatus(ProdOrderStatus.FINISHED.name());
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
