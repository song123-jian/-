package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.WarehouseLocationCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.WarehouseLocationResponse;
import com.injectmes.service.WarehouseLocationService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 库位管理控制器
 */
@RestController
@RequestMapping("/api/warehouse-locations")
@Validated
public class WarehouseLocationController {

    @Autowired
    private WarehouseLocationService warehouseLocationService;

    /**
     * 库位列表（分页，按仓库筛选）
     */
    @GetMapping
    public R<PageResponse<WarehouseLocationResponse>> list(
            @RequestParam(required = false) Long warehouseId,
            PageRequest request) {
        return warehouseLocationService.list(warehouseId, request);
    }

    /**
     * 新增库位
     */
    @PostMapping
    public R<WarehouseLocationResponse> create(@Valid @RequestBody WarehouseLocationCreateRequest request) {
        return warehouseLocationService.create(request);
    }

    /**
     * 编辑库位
     */
    @PutMapping("/{id}")
    public R<WarehouseLocationResponse> update(@PathVariable Long id, @Valid @RequestBody WarehouseLocationCreateRequest request) {
        return warehouseLocationService.update(id, request);
    }

    /**
     * 删除库位
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        return warehouseLocationService.delete(id);
    }
}
