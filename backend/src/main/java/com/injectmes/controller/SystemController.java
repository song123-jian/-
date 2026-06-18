package com.injectmes.controller;

import com.injectmes.annotation.OperationLog;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.SysOperationLog;
import com.injectmes.service.SystemService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统管理控制器
 * 提供系统配置管理、操作日志查询、数据库备份与恢复接口
 */
@RestController
@RequestMapping("/api/system")
@Validated
public class SystemController {

    @Autowired
    private SystemService systemService;

    @Value("${file.upload-path:./uploads/}")
    private String uploadPath;

    /**
     * 获取系统配置
     */
    @GetMapping("/config")
    public R<Map<String, String>> getConfig() {
        return systemService.getConfig();
    }

    /**
     * 更新系统配置
     */
    @PutMapping("/config")
    @OperationLog(module = "系统管理", action = "更新配置")
    public R<Void> updateConfig(@RequestBody Map<String, String> configMap) {
        return systemService.updateConfig(configMap);
    }

    /**
     * 操作日志列表（分页）
     */
    @GetMapping("/logs")
    public R<PageResponse<SysOperationLog>> listLogs(PageRequest request) {
        return systemService.listLogs(request);
    }

    /**
     * 手动备份数据库
     */
    @PostMapping("/backup")
    @OperationLog(module = "系统管理", action = "手动备份")
    public R<Void> backup() {
        return systemService.backup();
    }

    /**
     * 恢复数据库备份
     */
    @PostMapping("/restore")
    @OperationLog(module = "系统管理", action = "恢复备份")
    public R<Void> restore(@RequestBody Map<String, String> body) {
        String backupFile = body.get("backupFile");
        if (backupFile == null || backupFile.trim().isEmpty()) {
            return R.fail("备份文件名不能为空");
        }
        return systemService.restore(backupFile);
    }

    /**
     * 获取备份列表
     */
    @GetMapping("/backup")
    public R<List<Map<String, Object>>> listBackups() {
        try {
            Path backupDir = Paths.get(uploadPath, "backups");
            if (!Files.exists(backupDir)) {
                return R.ok(new ArrayList<>());
            }
            List<Map<String, Object>> backupList = new ArrayList<>();
            try (java.util.stream.Stream<Path> paths = Files.list(backupDir)) {
                paths.filter(p -> p.toString().endsWith(".sql"))
                     .sorted((a, b) -> {
                         try {
                             return -Long.compare(Files.getLastModifiedTime(a).toMillis(),
                                                  Files.getLastModifiedTime(b).toMillis());
                         } catch (Exception e) {
                             return 0;
                         }
                     })
                     .forEach(p -> {
                         Map<String, Object> item = new HashMap<>();
                         item.put("fileName", p.getFileName().toString());
                         try {
                             item.put("fileSize", Files.size(p));
                             item.put("modifiedTime", Files.getLastModifiedTime(p).toString());
                         } catch (Exception e) {
                             item.put("fileSize", 0);
                             item.put("modifiedTime", "");
                         }
                         backupList.add(item);
                     });
            }
            return R.ok(backupList);
        } catch (Exception e) {
            return R.fail("获取备份列表失败: " + e.getMessage());
        }
    }

    /**
     * 恢复指定备份（按ID/文件名）
     */
    @PostMapping("/backup/{id}/restore")
    @OperationLog(module = "系统管理", action = "恢复备份")
    public R<Void> restoreById(@PathVariable String id) {
        // id 实际上是备份文件名
        return systemService.restore(id);
    }
}
