package com.injectmes.controller;

import com.injectmes.annotation.OperationLog;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.SysOperationLog;
import com.injectmes.service.SystemService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/system")
@Validated
public class SystemController {

    @Autowired
    private SystemService systemService;

    @GetMapping("/config")
    public R<Map<String, String>> getConfig() {
        return systemService.getConfig();
    }

    @PutMapping("/config")
    @OperationLog(module = "系统管理", action = "更新配置")
    public R<Void> updateConfig(@RequestBody Map<String, String> configMap) {
        return systemService.updateConfig(configMap);
    }

    @GetMapping("/logs")
    public R<PageResponse<SysOperationLog>> listLogs(PageRequest request) {
        return systemService.listLogs(request);
    }

    @PostMapping("/backup")
    @OperationLog(module = "系统管理", action = "手动备份")
    public R<Void> backup() {
        return systemService.backup();
    }

    @PostMapping("/restore")
    @OperationLog(module = "系统管理", action = "恢复备份")
    public R<Void> restore(@RequestBody Map<String, String> body) {
        String backupFile = body.get("backupFile");
        if (backupFile == null || backupFile.trim().isEmpty()) {
            return R.fail("备份文件名不能为空");
        }
        return systemService.restore(backupFile);
    }

    @GetMapping("/backup")
    public R<List<Map<String, Object>>> listBackups() {
        return systemService.listBackups();
    }

    @PostMapping("/backup/{id}/restore")
    @OperationLog(module = "系统管理", action = "恢复备份")
    public R<Void> restoreById(@PathVariable String id) {
        return systemService.restore(id);
    }
}
