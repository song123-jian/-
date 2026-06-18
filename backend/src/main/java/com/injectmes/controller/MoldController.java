package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.MoldCreateRequest;
import com.injectmes.dto.req.MoldUpdateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MoldResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.MoldService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 模具管理控制器
 */
@RestController
@RequestMapping("/api/molds")
@Validated
public class MoldController {

    @Autowired
    private MoldService moldService;

    /**
     * 模具列表（分页）
     */
    @GetMapping
    public R<PageResponse<MoldResponse>> list(PageRequest request) {
        return moldService.list(request);
    }

    /**
     * 模具详情
     */
    @GetMapping("/{id}")
    public R<MoldResponse> getById(@PathVariable Long id) {
        return moldService.getById(id);
    }

    /**
     * 新增模具
     */
    @PostMapping
    public R<MoldResponse> create(@Valid @RequestBody MoldCreateRequest request) {
        return moldService.create(request);
    }

    /**
     * 编辑模具
     */
    @PutMapping("/{id}")
    public R<MoldResponse> update(@PathVariable Long id, @Valid @RequestBody MoldUpdateRequest request) {
        return moldService.update(id, request);
    }

    /**
     * 删除模具
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        moldService.delete(id);
        return R.ok();
    }

    /**
     * 模次统计
     */
    @GetMapping("/{id}/shots")
    public R<Map<String, Object>> getShotsStats(@PathVariable Long id) {
        return moldService.getShotsStats(id);
    }
}
