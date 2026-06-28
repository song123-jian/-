package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdReportRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdReportResponse;
import com.injectmes.security.LoginUserDetails;
import com.injectmes.service.ProdReportService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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

    /**
     * 报工
     */
    @PostMapping
    public R<ProdReportResponse> report(@Valid @RequestBody ProdReportRequest request) {
        return prodReportService.report(request);
    }

    /**
     * 报工记录列表
     */
    @GetMapping
    public R<PageResponse<ProdReportResponse>> list(PageRequest request,
                                                    @RequestParam(name = "reportType", required = false) String reportType,
                                                    @RequestParam(name = "shift", required = false) String shift,
                                                    @RequestParam(name = "startDate", required = false) String startDate,
                                                    @RequestParam(name = "endDate", required = false) String endDate) {
        return prodReportService.list(request, reportType, shift, startDate, endDate);
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
     * 当前班次任务
     */
    @GetMapping("/current-shift-tasks")
    public R<List<Map<String, Object>>> currentShiftTasks() {
        return prodReportService.currentShiftTasks();
    }

    /**
     * 根据机台获取工单
     */
    @GetMapping("/work-orders")
    public R<List<Map<String, Object>>> workOrders(@RequestParam(name = "machineCode") String machineCode) {
        return prodReportService.workOrdersByMachineCode(machineCode);
    }

    /**
     * 我的产量统计
     */
    @GetMapping("/my-output-stats")
    public R<Map<String, Object>> myOutputStats(@RequestParam(name = "type", required = false) String type,
                                                @AuthenticationPrincipal LoginUserDetails loginUser) {
        return prodReportService.myOutputStats(loginUser.getUserId(), type);
    }

    /**
     * 我的报工记录（移动端）
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
    public R<ProdReportResponse> update(@PathVariable(name = "id") Long id, @Valid @RequestBody ProdReportRequest request) {
        return prodReportService.update(id, request);
    }

    /**
     * 删除报工
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        return prodReportService.delete(id);
    }
}
