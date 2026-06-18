package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProductCreateRequest;
import com.injectmes.dto.req.ProductUpdateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProductResponse;
import com.injectmes.service.ProductService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 产品管理控制器
 */
@RestController
@RequestMapping("/api/products")
@Validated
public class ProductController {

    @Autowired
    private ProductService productService;

    /**
     * 产品列表（分页）
     */
    @GetMapping
    public R<PageResponse<ProductResponse>> list(PageRequest request) {
        return productService.list(request);
    }

    /**
     * 产品详情
     */
    @GetMapping("/{id}")
    public R<ProductResponse> getById(@PathVariable Long id) {
        return productService.getById(id);
    }

    /**
     * 新增产品
     */
    @PostMapping
    public R<ProductResponse> create(@Valid @RequestBody ProductCreateRequest request) {
        return productService.create(request);
    }

    /**
     * 编辑产品
     */
    @PutMapping("/{id}")
    public R<ProductResponse> update(@PathVariable Long id, @Valid @RequestBody ProductUpdateRequest request) {
        return productService.update(id, request);
    }

    /**
     * 删除产品
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        productService.delete(id);
        return R.ok();
    }
}
