package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.MoldMountRecordRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MoldMountRecordResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.MoldMountRecordService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * 模具上下模记录控制器
 */
@RestController
@RequestMapping("/api/mold-mount-records")
@Validated
public class MoldMountRecordController {

    @Autowired
    private MoldMountRecordService moldMountRecordService;

    /**
     * 上下模记录列表
     */
    @GetMapping
    public R<PageResponse<MoldMountRecordResponse>> list(PageRequest request,
                                                         @RequestParam(required = false) Long moldId,
                                                         @RequestParam(required = false) Long machineId,
                                                         @RequestParam(required = false) String mountType,
                                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return moldMountRecordService.list(request, moldId, machineId, mountType, startDate, endDate);
    }

    /**
     * 新增上下模记录
     */
    @PostMapping
    public R<MoldMountRecordResponse> create(@Valid @RequestBody MoldMountRecordRequest request) {
        return moldMountRecordService.create(request);
    }
}
