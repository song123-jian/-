package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.annotation.OperationLog;
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
    @OperationLog(module = "模具管理", action = "查询列表")
    public R<PageResponse<MoldResponse>> list(PageRequest request,
                                              @RequestParam(name = "status", required = false) String status) {
        return moldService.list(request, status);
    }

    /**
     * 模具详情
     */
    @GetMapping("/{id}")
    @OperationLog(module = "模具管理", action = "查看详情")
    public R<MoldResponse> getById(@PathVariable(name = "id") Long id) {
        return moldService.getById(id);
    }

    /**
     * 新增模具
     */
    @PostMapping
    @OperationLog(module = "模具管理", action = "新增")
    public R<MoldResponse> create(@Valid @RequestBody MoldCreateRequest request) {
        return moldService.create(request);
    }

    /**
     * 编辑模具
     */
    @PutMapping("/{id}")
    @OperationLog(module = "模具管理", action = "编辑")
    public R<MoldResponse> update(@PathVariable(name = "id") Long id, @Valid @RequestBody MoldUpdateRequest request) {
        return moldService.update(id, request);
    }

    /**
     * 删除模具
     */
    @DeleteMapping("/{id}")
    @OperationLog(module = "模具管理", action = "删除")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        moldService.delete(id);
        return R.ok();
    }

    /**
     * 模次统计
     */
    @GetMapping("/{id}/shots")
    @OperationLog(module = "模具管理", action = "查看统计")
    public R<Map<String, Object>> getShotsStats(@PathVariable(name = "id") Long id) {
        return moldService.getShotsStats(id);
    }

    /**
     * 模具保养
     */
    @PostMapping("/{id}/maintenance")
    @OperationLog(module = "模具管理", action = "保养")
    public R<MoldResponse> maintenance(@PathVariable(name = "id") Long id) {
        return moldService.maintenance(id);
    }
}
