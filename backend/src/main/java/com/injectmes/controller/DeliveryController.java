package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.DeliveryCreateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.DeliveryResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.DeliveryService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 发货管理控制器
 */
@RestController
@RequestMapping("/api")
@Validated
public class DeliveryController {

    @Autowired
    private DeliveryService deliveryService;

    @GetMapping("/deliveries")
    public R<PageResponse<DeliveryResponse>> list(PageRequest request) {
        return deliveryService.list(request);
    }

    @PostMapping("/deliveries")
    public R<DeliveryResponse> create(@Valid @RequestBody DeliveryCreateRequest request) {
        return deliveryService.create(request);
    }

    @PutMapping("/deliveries/{id}/ship")
    public R<Void> ship(@PathVariable Long id) {
        return deliveryService.ship(id);
    }

    @PutMapping("/deliveries/{id}/receive")
    public R<Void> receive(@PathVariable Long id) {
        return deliveryService.receive(id);
    }

    @PutMapping("/deliveries/{id}")
    public R<DeliveryResponse> update(@PathVariable Long id, @Valid @RequestBody DeliveryCreateRequest request) {
        return deliveryService.update(id, request);
    }

    @DeleteMapping("/deliveries/{id}")
    public R<Void> delete(@PathVariable Long id) {
        return deliveryService.delete(id);
    }
}
