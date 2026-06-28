package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.DowntimeRecordRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.DowntimeRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.security.LoginUserDetails;
import com.injectmes.service.DowntimeRecordService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
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

import java.time.LocalDate;

/**
 * 停机记录控制器
 */
@RestController
@RequestMapping("/api/downtime-records")
@Validated
public class DowntimeRecordController {

    @Autowired
    private DowntimeRecordService downtimeRecordService;

    @GetMapping
    public R<PageResponse<DowntimeRecordResponse>> list(PageRequest request,
                                                        @RequestParam(name = "machineId", required = false) Long machineId,
                                                        @RequestParam(name = "reason", required = false) String reason,
                                                        @RequestParam(name = "downtimeType", required = false) String downtimeType,
                                                        @RequestParam(name = "startDate", required = false)
                                                        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                        @RequestParam(name = "endDate", required = false)
                                                        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return downtimeRecordService.list(request, machineId, reason, downtimeType, startDate, endDate);
    }

    @PostMapping
    public R<DowntimeRecordResponse> create(@Valid @RequestBody DowntimeRecordRequest request,
                                            @AuthenticationPrincipal LoginUserDetails loginUser) {
        Long operatorId = loginUser != null ? loginUser.getUserId() : null;
        return downtimeRecordService.create(request, operatorId);
    }

    @PutMapping("/{id}")
    public R<DowntimeRecordResponse> update(@PathVariable(name = "id") Long id,
                                            @Valid @RequestBody DowntimeRecordRequest request,
                                            @AuthenticationPrincipal LoginUserDetails loginUser) {
        Long operatorId = loginUser != null ? loginUser.getUserId() : null;
        return downtimeRecordService.update(id, request, operatorId);
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        return downtimeRecordService.delete(id);
    }
}
