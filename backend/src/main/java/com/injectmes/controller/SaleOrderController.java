package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.SaleOrderCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.SaleOrderResponse;
import com.injectmes.service.SaleOrderService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
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
 * 销售订单管理控制器
 */
@RestController
@RequestMapping("/api/sale-orders")
@Validated
public class SaleOrderController {

    @Autowired
    private SaleOrderService saleOrderService;

    @GetMapping
    public R<PageResponse<SaleOrderResponse>> list(PageRequest request,
                                                   @RequestParam(name = "status", required = false) String status,
                                                   @RequestParam(name = "startDate", required = false)
                                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                   @RequestParam(name = "endDate", required = false)
                                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return saleOrderService.list(request, status, startDate, endDate);
    }

    @GetMapping("/{id}")
    public R<SaleOrderResponse> getById(@PathVariable(name = "id") Long id) {
        return saleOrderService.getById(id);
    }

    @PostMapping
    public R<SaleOrderResponse> create(@Valid @RequestBody SaleOrderCreateRequest request) {
        return saleOrderService.create(request);
    }

    @PutMapping("/{id}")
    public R<SaleOrderResponse> update(@PathVariable(name = "id") Long id, @Valid @RequestBody SaleOrderCreateRequest request) {
        return saleOrderService.update(id, request);
    }

    @PutMapping("/{id}/confirm")
    public R<Void> confirm(@PathVariable(name = "id") Long id) {
        return saleOrderService.confirm(id);
    }

    @PutMapping("/{id}/cancel")
    public R<Void> cancel(@PathVariable(name = "id") Long id) {
        return saleOrderService.cancel(id);
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        return saleOrderService.delete(id);
    }

    @PutMapping("/{id}/approve")
    public R<Void> approve(@PathVariable(name = "id") Long id) {
        return saleOrderService.confirm(id);
    }
}
