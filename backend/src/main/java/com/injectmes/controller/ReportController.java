package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.resp.OeeResponse;
import com.injectmes.service.DashboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 报表统计控制器
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    @Autowired
    private DashboardService dashboardService;

    /**
     * OEE统计
     *
     * @param machineId 机台ID（可选，为空则取所有机台平均值）
     * @param date      统计日期（可选，默认当天）
     */
    @GetMapping("/oee")
    public R<OeeResponse> oeeStats(
            @RequestParam(required = false) Long machineId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return dashboardService.oeeStats(machineId, date);
    }
}
