package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdReportRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdReportResponse;
import com.injectmes.entity.ProdReport;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.security.LoginUserDetails;
import com.injectmes.service.ProdReportService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 生产报工控制器
 */
@RestController
@RequestMapping("/api/prod-reports")
@Validated
public class ProdReportController {

    @Autowired
    private ProdReportService prodReportService;

    @Autowired
    private ProdReportMapper prodReportMapper;

    /**
     * 报工
     */
    @PostMapping
    public R<ProdReportResponse> report(@Valid @RequestBody ProdReportRequest request) {
        return prodReportService.report(request);
    }

    /**
     * 报工记录列表（全部，分页）
     */
    @GetMapping
    public R<PageResponse<ProdReportResponse>> list(PageRequest request) {
        return prodReportService.list(request);
    }

    /**
     * 当日产量汇总
     */
    @GetMapping("/today")
    public R<List<ProdReportResponse>> todaySummary() {
        return prodReportService.todaySummary();
    }

    /**
     * 我的报工记录
     */
    @GetMapping("/my")
    public R<PageResponse<ProdReportResponse>> myReports(PageRequest request,
                                                          @AuthenticationPrincipal LoginUserDetails loginUser) {
        return prodReportService.myReports(request, loginUser.getUserId());
    }

    /**
     * 当前班次任务（移动端兼容）
     */
    @GetMapping("/current-shift-tasks")
    public R<List<Map<String, Object>>> currentShiftTasks() {
        return prodReportService.currentShiftTasks();
    }

    /**
     * 根据机台获取工单（移动端兼容）
     */
    @GetMapping("/work-orders")
    public R<List<Map<String, Object>>> workOrders(@RequestParam String machineCode) {
        return prodReportService.workOrdersByMachineCode(machineCode);
    }

    /**
     * 我的产量统计（移动端兼容）
     */
    @GetMapping("/my-output-stats")
    public R<Map<String, Object>> myOutputStats(@RequestParam(required = false) String type,
                                                @AuthenticationPrincipal LoginUserDetails loginUser) {
        return prodReportService.myOutputStats(loginUser.getUserId(), type);
    }

    /**
     * 我的报工记录（移动端兼容）
     */
    @GetMapping("/my-reports")
    public R<PageResponse<ProdReportResponse>> myReportsForMobile(PageRequest request,
                                                                  @AuthenticationPrincipal LoginUserDetails loginUser) {
        return prodReportService.myReports(request, loginUser.getUserId());
    }

    /**
     * 更新报工
     */
    @PutMapping("/{id}")
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody ProdReportRequest request) {
        ProdReport prodReport = prodReportMapper.selectById(id);
        if (prodReport == null) {
            return R.fail("报工记录不存在");
        }
        BeanUtils.copyProperties(request, prodReport);
        prodReport.setId(id);
        prodReportMapper.updateById(prodReport);
        return R.ok("更新成功", null);
    }

    /**
     * 删除报工
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        prodReportMapper.deleteById(id);
        return R.ok("删除成功", null);
    }
}
