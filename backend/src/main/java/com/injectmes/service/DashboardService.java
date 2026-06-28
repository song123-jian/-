package com.injectmes.service;

import com.injectmes.common.R;
import com.injectmes.dto.resp.DashboardBossResponse;
import com.injectmes.dto.resp.DashboardHomeResponse;
import com.injectmes.dto.resp.DashboardProductionResponse;
import com.injectmes.dto.resp.DashboardQualityResponse;
import com.injectmes.dto.resp.OeeResponse;
import com.injectmes.service.dashboard.DashboardOperationalService;
import com.injectmes.service.dashboard.DashboardOverviewService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

@Service
public class DashboardService {

    @Autowired
    private DashboardOverviewService dashboardOverviewService;
    @Autowired
    private DashboardOperationalService dashboardOperationalService;

    public R<DashboardHomeResponse> homeDashboard(Long userId) {
        return dashboardOverviewService.homeDashboard(userId);
    }

    public R<DashboardBossResponse> bossDashboard() {
        return dashboardOverviewService.bossDashboard();
    }

    public R<DashboardProductionResponse> productionDashboard() {
        return dashboardOperationalService.productionDashboard();
    }

    public R<DashboardQualityResponse> qualityDashboard() {
        return dashboardOperationalService.qualityDashboard();
    }

    public R<OeeResponse> oeeStats(Long machineId, LocalDate date) {
        return dashboardOperationalService.oeeStats(machineId, date);
    }
}
