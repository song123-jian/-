package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.WarehouseCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.WarehouseResponse;
import com.injectmes.service.WarehouseService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 仓库管理控制器
 */
@RestController
@RequestMapping("/api/warehouses")
@Validated
public class WarehouseController {

    @Autowired
    private WarehouseService warehouseService;

    /**
     * 仓库列表（分页）
     */
    @GetMapping
    public R<PageResponse<WarehouseResponse>> list(PageRequest request) {
        return warehouseService.list(request);
    }

    /**
     * 仓库详情
     */
    @GetMapping("/{id}")
    public R<WarehouseResponse> getById(@PathVariable Long id) {
        return warehouseService.getById(id);
    }

    /**
     * 新增仓库
     */
    @PostMapping
    public R<WarehouseResponse> create(@Valid @RequestBody WarehouseCreateRequest request) {
        return warehouseService.create(request);
    }

    /**
     * 编辑仓库
     */
    @PutMapping("/{id}")
    public R<WarehouseResponse> update(@PathVariable Long id, @Valid @RequestBody WarehouseCreateRequest request) {
        return warehouseService.update(id, request);
    }

    /**
     * 删除仓库
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        return warehouseService.delete(id);
    }
}
