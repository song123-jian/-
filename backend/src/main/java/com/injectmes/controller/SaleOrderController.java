package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.SaleOrderCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.SaleOrderResponse;
import com.injectmes.mapper.SaleOrderMapper;
import com.injectmes.service.SaleOrderService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * 销售订单管理控制器
 */
@RestController
@RequestMapping("/api/sale-orders")
@Validated
public class SaleOrderController {

    @Autowired
    private SaleOrderService saleOrderService;

    @Autowired
    private SaleOrderMapper saleOrderMapper;

    /**
     * 订单列表（分页，支持status筛选、keyword搜索、日期范围）
     */
    @GetMapping
    public R<PageResponse<SaleOrderResponse>> list(PageRequest request,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return saleOrderService.list(request, status, startDate, endDate);
    }

    /**
     * 订单详情
     */
    @GetMapping("/{id}")
    public R<SaleOrderResponse> getById(@PathVariable Long id) {
        return saleOrderService.getById(id);
    }

    /**
     * 创建订单
     */
    @PostMapping
    public R<SaleOrderResponse> create(@Valid @RequestBody SaleOrderCreateRequest request) {
        return saleOrderService.create(request);
    }

    /**
     * 编辑订单
     */
    @PutMapping("/{id}")
    public R<SaleOrderResponse> update(@PathVariable Long id, @Valid @RequestBody SaleOrderCreateRequest request) {
        return saleOrderService.update(id, request);
    }

    /**
     * 确认订单
     */
    @PutMapping("/{id}/confirm")
    public R<Void> confirm(@PathVariable Long id) {
        return saleOrderService.confirm(id);
    }

    /**
     * 取消订单
     */
    @PutMapping("/{id}/cancel")
    public R<Void> cancel(@PathVariable Long id) {
        return saleOrderService.cancel(id);
    }

    /**
     * 删除销售订单
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        saleOrderMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    /**
     * 审批销售订单（路径别名，和 /confirm 一样）
     */
    @PutMapping("/{id}/approve")
    public R<Void> approve(@PathVariable Long id) {
        return saleOrderService.confirm(id);
    }
}
