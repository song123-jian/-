package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.StockTransferCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.StockTransferResponse;
import com.injectmes.service.StockTransferService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 调拨管理控制器
 */
@RestController
@RequestMapping("/api/stock-transfers")
@Validated
public class StockTransferController {

    @Autowired
    private StockTransferService stockTransferService;

    /**
     * 调拨单列表（分页）
     */
    @GetMapping
    public R<PageResponse<StockTransferResponse>> list(PageRequest request) {
        return stockTransferService.list(request);
    }

    /**
     * 创建调拨单
     */
    @PostMapping
    public R<StockTransferResponse> create(@Valid @RequestBody StockTransferCreateRequest request) {
        return stockTransferService.create(request);
    }

    /**
     * 确认发货
     */
    @PutMapping("/{id}/ship")
    public R<Void> ship(@PathVariable Long id) {
        return stockTransferService.ship(id);
    }

    /**
     * 确认收货
     */
    @PutMapping("/{id}/receive")
    public R<Void> receive(@PathVariable Long id) {
        return stockTransferService.receive(id);
    }
}
