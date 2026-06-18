package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.PaymentRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.PaymentResponse;
import com.injectmes.entity.PaymentRecord;
import com.injectmes.mapper.PaymentRecordMapper;
import com.injectmes.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

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

    @Autowired
    private PaymentRecordMapper paymentRecordMapper;

    /**
     * 回款登记
     */
    @PostMapping("/payments")
    public R<PaymentResponse> create(@Valid @RequestBody PaymentRequest request) {
        return paymentService.create(request);
    }

    /**
     * 回款记录列表
     */
    @GetMapping("/payments")
    public R<PageResponse<PaymentResponse>> list(PageRequest request,
                                                   @RequestParam(required = false) Long customerId,
                                                   @RequestParam(required = false) Long saleOrderId) {
        return paymentService.list(request, customerId, saleOrderId);
    }

    /**
     * 应收账款（按客户汇总）
     */
    @GetMapping("/receivables")
    public R<List<Map<String, Object>>> receivables() {
        return paymentService.receivables();
    }

    /**
     * 更新回款
     */
    @PutMapping("/payments/{id}")
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody PaymentRequest request) {
        PaymentRecord record = paymentRecordMapper.selectById(id);
        if (record == null) {
            return R.fail("回款记录不存在");
        }
        BeanUtils.copyProperties(request, record);
        record.setId(id);
        paymentRecordMapper.updateById(record);
        return R.ok("更新成功", null);
    }

    /**
     * 删除回款
     */
    @DeleteMapping("/payments/{id}")
    public R<Void> delete(@PathVariable Long id) {
        paymentRecordMapper.deleteById(id);
        return R.ok("删除成功", null);
    }
}
