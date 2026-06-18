package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.MaterialBatchCreateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MaterialBatchResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.MaterialBatchService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 物料批次管理控制器
 */
@RestController
@RequestMapping("/api/material-batches")
@Validated
public class MaterialBatchController {

    @Autowired
    private MaterialBatchService materialBatchService;

    /**
     * 批次列表（分页）
     */
    @GetMapping
    public R<PageResponse<MaterialBatchResponse>> list(PageRequest request) {
        return materialBatchService.list(request);
    }

    /**
     * 批次详情
     */
    @GetMapping("/{id}")
    public R<MaterialBatchResponse> getById(@PathVariable Long id) {
        return materialBatchService.getById(id);
    }

    /**
     * 新增批次
     */
    @PostMapping
    public R<MaterialBatchResponse> create(@Valid @RequestBody MaterialBatchCreateRequest request) {
        return materialBatchService.create(request);
    }
}
