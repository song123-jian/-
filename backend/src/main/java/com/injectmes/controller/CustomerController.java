package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.CustomerCreateRequest;
import com.injectmes.dto.req.CustomerUpdateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.CustomerResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.CustomerService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 客户管理控制器
 */
@RestController
@RequestMapping("/api/customers")
@Validated
public class CustomerController {

    @Autowired
    private CustomerService customerService;

    /**
     * 客户列表（分页）
     */
    @GetMapping
    public R<PageResponse<CustomerResponse>> list(PageRequest request) {
        return customerService.list(request);
    }

    /**
     * 客户详情
     */
    @GetMapping("/{id}")
    public R<CustomerResponse> getById(@PathVariable Long id) {
        return customerService.getById(id);
    }

    /**
     * 新增客户
     */
    @PostMapping
    public R<CustomerResponse> create(@Valid @RequestBody CustomerCreateRequest request) {
        return customerService.create(request);
    }

    /**
     * 编辑客户
     */
    @PutMapping("/{id}")
    public R<CustomerResponse> update(@PathVariable Long id, @Valid @RequestBody CustomerUpdateRequest request) {
        return customerService.update(id, request);
    }

    /**
     * 删除客户
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        customerService.delete(id);
        return R.ok();
    }
}
