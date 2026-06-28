package com.injectmes.service.prodreport;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.injectmes.common.R;
import com.injectmes.dto.req.ProdReportRequest;
import com.injectmes.dto.resp.ProdReportResponse;
import com.injectmes.entity.Machine;
import com.injectmes.entity.Mold;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.ProdReport;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.enums.ReportType;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.security.LoginUserDetails;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

@Service
public class ProdReportCommandService {

    @Autowired
    private ProdReportMapper prodReportMapper;
    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private MachineMapper machineMapper;
    @Autowired
    private MoldMapper moldMapper;
    @Autowired
    private ProdReportQueryService prodReportQueryService;

    @Transactional
    public R<ProdReportResponse> report(ProdReportRequest request) {
        ProdOrder order = requireOrder(request.getProdOrderId());
        Machine machine = requireMachine(request.getMachineId());
        validateMachineMatch(order, machine);
        ensureRunning(order);
        ensureQtyWithinTolerance(order, request.getQty());

        ProdReport prodReport = new ProdReport();
        BeanUtils.copyProperties(request, prodReport);
        prodReport.setUserId(resolveCurrentUserId());
        prodReport.setMachineId(machine.getId());
        prodReport.setCreatedAt(LocalDateTime.now());

        applyReportToOrder(order, request);
        fillWorkMinutes(request, prodReport);
        prodReportMapper.insert(prodReport);

        return R.ok("报工成功", prodReportQueryService.reportToResponse(prodReport));
    }

    @Transactional
    public R<ProdReportResponse> update(Long id, ProdReportRequest request) {
        ProdReport prodReport = requireReport(id);
        BeanUtils.copyProperties(request, prodReport);
        prodReport.setId(id);
        prodReport.setUserId(resolveCurrentUserId());
        prodReport.setMachineId(request.getMachineId());
        prodReport.setCreatedAt(prodReport.getCreatedAt() != null ? prodReport.getCreatedAt() : LocalDateTime.now());
        fillWorkMinutes(request, prodReport);
        prodReportMapper.updateById(prodReport);
        return R.ok("更新成功", prodReportQueryService.reportToResponse(prodReport));
    }

    @Transactional
    public R<Void> delete(Long id) {
        requireReport(id);
        prodReportMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    private ProdOrder requireOrder(Long id) {
        ProdOrder order = prodOrderMapper.selectById(id);
        if (order == null) {
            throw new BusinessException("生产工单不存在");
        }
        return order;
    }

    private ProdReport requireReport(Long id) {
        ProdReport prodReport = prodReportMapper.selectById(id);
        if (prodReport == null) {
            throw new BusinessException("报工记录不存在");
        }
        return prodReport;
    }

    private Machine requireMachine(Long machineId) {
        Machine machine = machineMapper.selectById(machineId);
        if (machine == null) {
            throw new BusinessException("注塑机不存在");
        }
        return machine;
    }

    private void validateMachineMatch(ProdOrder order, Machine machine) {
        if (order.getMachineId() != null && !order.getMachineId().equals(machine.getId())) {
            throw new BusinessException("报工机台与工单不一致");
        }
    }

    private void ensureRunning(ProdOrder order) {
        if (!ProdOrderStatus.RUNNING.name().equals(order.getStatus())) {
            throw new BusinessException("工单状态不是生产中，无法报工");
        }
    }

    private void ensureQtyWithinTolerance(ProdOrder order, Integer reportQty) {
        int planQty = order.getPlanQty() != null ? order.getPlanQty() : 0;
        int planQtyWithTolerance = (int) Math.ceil(planQty * 1.05);
        int currentCompleted = order.getCompletedQty() != null ? order.getCompletedQty() : 0;
        int qty = reportQty != null ? reportQty : 0;
        if (currentCompleted + qty > planQtyWithTolerance) {
            throw new BusinessException("报工数量超出计划数量容差范围");
        }
    }

    private void applyReportToOrder(ProdOrder order, ProdReportRequest request) {
        String reportType = request.getReportType();
        if (ReportType.START.name().equals(reportType)) {
            if (order.getActualStart() == null) {
                order.setActualStart(LocalDateTime.now());
            }
        } else if (ReportType.OUTPUT.name().equals(reportType)) {
            int currentCompleted = order.getCompletedQty() != null ? order.getCompletedQty() : 0;
            int currentBadQty = order.getBadQty() != null ? order.getBadQty() : 0;
            order.setCompletedQty(currentCompleted + (request.getQty() != null ? request.getQty() : 0));
            order.setBadQty(currentBadQty + (request.getBadQty() != null ? request.getBadQty() : 0));

            if (request.getMoldId() != null && request.getShots() != null && request.getShots() > 0) {
                moldMapper.update(null, new LambdaUpdateWrapper<Mold>()
                        .eq(Mold::getId, request.getMoldId())
                        .setSql("used_shots = COALESCE(used_shots, 0) + " + request.getShots()
                                + ", shots_since_maintenance = COALESCE(shots_since_maintenance, 0) + " + request.getShots()));
            }
        } else if (ReportType.END.name().equals(reportType)) {
            order.setActualEnd(LocalDateTime.now());
            order.setStatus(ProdOrderStatus.FINISHED.name());
        }

        order.setUpdatedAt(LocalDateTime.now());
        prodOrderMapper.updateById(order);
    }

    private void fillWorkMinutes(ProdReportRequest request, ProdReport prodReport) {
        if (request.getStartTime() != null && request.getEndTime() != null) {
            long minutes = Duration.between(request.getStartTime(), request.getEndTime()).toMinutes();
            prodReport.setWorkMinutes((int) minutes);
        }
    }

    private Long resolveCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUserDetails userDetails) {
            return userDetails.getUserId();
        }
        return null;
    }
}
