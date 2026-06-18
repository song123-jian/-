package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.StockInventoryCountRequest;
import com.injectmes.dto.req.StockInventoryCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.StockInventoryResponse;
import com.injectmes.service.StockInventoryService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 盘点管理控制器
 */
@RestController
@RequestMapping("/api/stock-inventories")
@Validated
public class StockInventoryController {

    @Autowired
    private StockInventoryService stockInventoryService;

    /**
     * 盘点单列表（分页）
     */
    @GetMapping
    public R<PageResponse<StockInventoryResponse>> list(PageRequest request) {
        return stockInventoryService.list(request);
    }

    /**
     * 创建盘点单
     */
    @PostMapping
    public R<StockInventoryResponse> create(@Valid @RequestBody StockInventoryCreateRequest request) {
        return stockInventoryService.create(request);
    }

    /**
     * 开始盘点
     */
    @PutMapping("/{id}/start")
    public R<Void> start(@PathVariable Long id) {
        return stockInventoryService.start(id);
    }

    /**
     * 录入实盘
     */
    @PutMapping("/{id}/count")
    public R<Void> count(@PathVariable Long id, @Valid @RequestBody StockInventoryCountRequest request) {
        return stockInventoryService.count(id, request);
    }

    /**
     * 审核通过
     */
    @PutMapping("/{id}/approve")
    public R<Void> approve(@PathVariable Long id) {
        return stockInventoryService.approve(id);
    }

    /**
     * 驳回
     */
    @PutMapping("/{id}/reject")
    public R<Void> reject(@PathVariable Long id) {
        return stockInventoryService.reject(id);
    }
}
