package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.annotation.OperationLog;
import com.injectmes.dto.req.MachineCreateRequest;
import com.injectmes.dto.req.MachineUpdateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MachineResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.MachineService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * 机台管理控制器
 */
@RestController
@RequestMapping("/api/machines")
@Validated
public class MachineController {

    @Autowired
    private MachineService machineService;

    /**
     * 机台列表（分页）
     */
    @GetMapping
    @OperationLog(module = "机台管理", action = "查询列表")
    public R<PageResponse<MachineResponse>> list(PageRequest request) {
        return machineService.list(request);
    }

    /**
     * 机台详情
     */
    @GetMapping("/{id}")
    @OperationLog(module = "机台管理", action = "查看详情")
    public R<MachineResponse> getById(@PathVariable(name = "id") Long id) {
        return machineService.getById(id);
    }

    /**
     * 新增机台
     */
    @PostMapping
    @OperationLog(module = "机台管理", action = "新增")
    public R<MachineResponse> create(@Valid @RequestBody MachineCreateRequest request) {
        return machineService.create(request);
    }

    /**
     * 编辑机台
     */
    @PutMapping("/{id}")
    @OperationLog(module = "机台管理", action = "编辑")
    public R<MachineResponse> update(@PathVariable(name = "id") Long id, @Valid @RequestBody MachineUpdateRequest request) {
        return machineService.update(id, request);
    }

    /**
     * 删除机台
     */
    @DeleteMapping("/{id}")
    @OperationLog(module = "机台管理", action = "删除")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        machineService.delete(id);
        return R.ok();
    }

    /**
     * 生成二维码
     */
    @GetMapping("/{id}/qrcode")
    @OperationLog(module = "机台管理", action = "生成二维码")
    public R<String> generateQrCode(@PathVariable(name = "id") Long id) {
        return machineService.generateQrCode(id);
    }
}
