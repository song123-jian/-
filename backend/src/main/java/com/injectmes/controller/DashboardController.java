package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.resp.DashboardBossResponse;
import com.injectmes.dto.resp.DashboardProductionResponse;
import com.injectmes.dto.resp.DashboardQualityResponse;
import com.injectmes.service.DashboardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 报表看板控制器
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    @Autowired
    private DashboardService dashboardService;

    /**
     * 老板驾驶舱
     */
    @GetMapping("/boss")
    public R<DashboardBossResponse> bossDashboard() {
        return dashboardService.bossDashboard();
    }

    /**
     * 老板驾驶舱（路径别名，和 /boss 一样）
     */
    @GetMapping
    public R<DashboardBossResponse> dashboard() {
        return dashboardService.bossDashboard();
    }

    /**
     * 生产看板
     */
    @GetMapping("/production")
    public R<DashboardProductionResponse> productionDashboard() {
        return dashboardService.productionDashboard();
    }

    /**
     * 品质看板
     */
    @GetMapping("/quality")
    public R<DashboardQualityResponse> qualityDashboard() {
        return dashboardService.qualityDashboard();
    }
}
