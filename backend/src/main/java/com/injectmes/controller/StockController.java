package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.*;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.StockMoveResponse;
import com.injectmes.dto.resp.StockResponse;
import com.injectmes.service.StockService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 库存管理控制器
 */
@RestController
@RequestMapping("/api/stock")
@Validated
public class StockController {

    @Autowired
    private StockService stockService;

    /**
     * 库存查询（分页）
     */
    @GetMapping
    public R<PageResponse<StockResponse>> query(PageRequest request) {
        return stockService.query(request);
    }

    /**
     * 库存台账（流水查询，分页）
     */
    @GetMapping("/ledger")
    public R<PageResponse<StockMoveResponse>> ledger(PageRequest request) {
        return stockService.ledger(request);
    }

    /**
     * 采购入库
     */
    @PostMapping("/in-purchase")
    public R<Void> inPurchase(@Valid @RequestBody StockInPurchaseRequest request) {
        return stockService.inPurchase(request);
    }

    /**
     * 生产领料出库
     */
    @PostMapping("/out-picking")
    public R<Void> outPicking(@Valid @RequestBody StockOutPickingRequest request) {
        return stockService.outPicking(request);
    }

    /**
     * 成品入库
     */
    @PostMapping("/in-produce")
    public R<Void> inProduce(@Valid @RequestBody StockInProduceRequest request) {
        return stockService.inProduce(request);
    }

    /**
     * 销售出库
     */
    @PostMapping("/out-sale")
    public R<Void> outSale(@Valid @RequestBody StockOutSaleRequest request) {
        return stockService.outSale(request);
    }

    /**
     * 退料入库
     */
    @PostMapping("/in-return")
    public R<Void> inReturn(@Valid @RequestBody StockInPurchaseRequest request) {
        return stockService.inReturn(request);
    }

    /**
     * 不良品出库
     */
    @PostMapping("/out-defect")
    public R<Void> outDefect(@Valid @RequestBody StockOutSaleRequest request) {
        return stockService.outDefect(request);
    }

    /**
     * 库存预警列表
     */
    @GetMapping("/warnings")
    public R<List<Map<String, Object>>> warnings() {
        return stockService.warnings();
    }
}
