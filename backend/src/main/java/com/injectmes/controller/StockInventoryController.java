package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
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
    public R<Void> count(@PathVariable Long id, @Valid @RequestBody com.injectmes.dto.req.StockInventoryCountRequest request) {
        return stockInventoryService.count(id, request);
    }

    /**
     * 提交审核
     */
    @PutMapping("/{id}/submit")
    public R<Void> submit(@PathVariable Long id) {
        return stockInventoryService.submit(id);
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

    /**
     * 移动端快速实盘兼容接口
     */
    @PostMapping("/mobile-check")
    public R<Void> mobileCheck(@RequestBody java.util.Map<String, Object> body) {
        Object warehouseIdValue = body.get("warehouseId");
        Object locationIdValue = body.get("locationId");
        Object productIdValue = body.get("productId");
        Object actualQuantityValue = body.get("actualQuantity");

        if (warehouseIdValue == null || locationIdValue == null || productIdValue == null || actualQuantityValue == null) {
            return R.fail("参数不能为空");
        }

        Long warehouseId = Long.valueOf(String.valueOf(warehouseIdValue));
        Long locationId = Long.valueOf(String.valueOf(locationIdValue));
        Long productId = Long.valueOf(String.valueOf(productIdValue));
        Integer actualQuantity = new java.math.BigDecimal(String.valueOf(actualQuantityValue)).intValue();
        String reason = body.get("reason") != null ? String.valueOf(body.get("reason")) : "移动端盘点";
        return stockInventoryService.quickMobileCheck(warehouseId, locationId, productId, actualQuantity, reason);
    }
}
