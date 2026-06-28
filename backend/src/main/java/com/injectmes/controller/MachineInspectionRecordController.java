package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.MachineInspectionRecordRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MachineInspectionRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.MachineInspectionRecordService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * 设备点检记录控制器
 */
@RestController
@RequestMapping("/api/machine-inspection-records")
@Validated
public class MachineInspectionRecordController {

    @Autowired
    private MachineInspectionRecordService machineInspectionRecordService;

    @GetMapping
    public R<PageResponse<MachineInspectionRecordResponse>> list(PageRequest request,
                                                                 @RequestParam(name = "machineId", required = false) Long machineId,
                                                                 @RequestParam(name = "inspectorId", required = false) Long inspectorId,
                                                                 @RequestParam(name = "result", required = false) String result,
                                                                 @RequestParam(name = "startDate", required = false)
                                                                 @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                                 @RequestParam(name = "endDate", required = false)
                                                                 @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return machineInspectionRecordService.list(request, machineId, inspectorId, result, startDate, endDate);
    }

    @PostMapping
    public R<MachineInspectionRecordResponse> create(@Valid @RequestBody MachineInspectionRecordRequest request) {
        return machineInspectionRecordService.create(request);
    }
}
