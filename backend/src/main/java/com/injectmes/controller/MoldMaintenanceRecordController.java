package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MoldMaintenanceRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.MoldMaintenanceRecordService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 模具保养记录控制器
 */
@RestController
@RequestMapping("/api/mold-maintenance-records")
@Validated
public class MoldMaintenanceRecordController {

    @Autowired
    private MoldMaintenanceRecordService moldMaintenanceRecordService;

    @GetMapping
    public R<PageResponse<MoldMaintenanceRecordResponse>> list(PageRequest request,
                                                               @RequestParam(name = "moldId", required = false) Long moldId,
                                                               @RequestParam(name = "operatorId", required = false) Long operatorId,
                                                               @RequestParam(name = "startDate", required = false)
                                                               @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                               @RequestParam(name = "endDate", required = false)
                                                               @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return moldMaintenanceRecordService.list(request, moldId, operatorId, startDate, endDate);
    }
}
