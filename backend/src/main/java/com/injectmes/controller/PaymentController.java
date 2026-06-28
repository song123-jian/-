package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.PaymentRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.PaymentResponse;
import com.injectmes.service.PaymentService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 回款管理控制器
 */
@RestController
@RequestMapping("/api")
@Validated
public class PaymentController {

    @Autowired
    private PaymentService paymentService;

    @PostMapping("/payments")
    public R<PaymentResponse> create(@Valid @RequestBody PaymentRequest request) {
        return paymentService.create(request);
    }

    @GetMapping("/payments")
    public R<PageResponse<PaymentResponse>> list(PageRequest request,
                                                 @RequestParam(name = "customerId", required = false) Long customerId,
                                                 @RequestParam(name = "saleOrderId", required = false) Long saleOrderId) {
        return paymentService.list(request, customerId, saleOrderId);
    }

    @GetMapping("/receivables")
    public R<List<Map<String, Object>>> receivables() {
        return paymentService.receivables();
    }

    @PutMapping("/payments/{id}")
    public R<PaymentResponse> update(@PathVariable(name = "id") Long id, @Valid @RequestBody PaymentRequest request) {
        return paymentService.update(id, request);
    }

    @DeleteMapping("/payments/{id}")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        return paymentService.delete(id);
    }
}
