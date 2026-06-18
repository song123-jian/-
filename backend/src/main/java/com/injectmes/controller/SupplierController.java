package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.SupplierCreateRequest;
import com.injectmes.dto.req.SupplierUpdateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.SupplierResponse;
import com.injectmes.service.SupplierService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 供应商管理控制器
 */
@RestController
@RequestMapping("/api/suppliers")
@Validated
public class SupplierController {

    @Autowired
    private SupplierService supplierService;

    /**
     * 供应商列表（分页）
     */
    @GetMapping
    public R<PageResponse<SupplierResponse>> list(PageRequest request) {
        return supplierService.list(request);
    }

    /**
     * 供应商详情
     */
    @GetMapping("/{id}")
    public R<SupplierResponse> getById(@PathVariable Long id) {
        return supplierService.getById(id);
    }

    /**
     * 新增供应商
     */
    @PostMapping
    public R<SupplierResponse> create(@Valid @RequestBody SupplierCreateRequest request) {
        return supplierService.create(request);
    }

    /**
     * 编辑供应商
     */
    @PutMapping("/{id}")
    public R<SupplierResponse> update(@PathVariable Long id, @Valid @RequestBody SupplierUpdateRequest request) {
        return supplierService.update(id, request);
    }

    /**
     * 删除供应商
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        supplierService.delete(id);
        return R.ok();
    }
}
