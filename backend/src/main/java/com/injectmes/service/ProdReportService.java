package com.injectmes.service;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdReportRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdReportResponse;
import com.injectmes.service.prodreport.ProdReportCommandService;
import com.injectmes.service.prodreport.ProdReportQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class ProdReportService {

    @Autowired
    private ProdReportQueryService prodReportQueryService;
    @Autowired
    private ProdReportCommandService prodReportCommandService;

    public R<ProdReportResponse> report(ProdReportRequest request) {
        return prodReportCommandService.report(request);
    }

    public R<PageResponse<ProdReportResponse>> list(PageRequest request,
                                                    String reportType,
                                                    String shift,
                                                    String startDate,
                                                    String endDate) {
        return prodReportQueryService.list(request, reportType, shift, startDate, endDate);
    }

    public R<List<ProdReportResponse>> todaySummary() {
        return prodReportQueryService.todaySummary();
    }

    public R<PageResponse<ProdReportResponse>> myReports(PageRequest request, Long userId) {
        return prodReportQueryService.myReports(request, userId);
    }

    public R<List<Map<String, Object>>> currentShiftTasks() {
        return prodReportQueryService.currentShiftTasks();
    }

    public R<List<Map<String, Object>>> workOrdersByMachineCode(String machineCode) {
        return prodReportQueryService.workOrdersByMachineCode(machineCode);
    }

    public R<Map<String, Object>> myOutputStats(Long userId, String type) {
        return prodReportQueryService.myOutputStats(userId, type);
    }

    public R<ProdReportResponse> update(Long id, ProdReportRequest request) {
        return prodReportCommandService.update(id, request);
    }

    public R<Void> delete(Long id) {
        return prodReportCommandService.delete(id);
    }
}
