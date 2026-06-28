package com.injectmes.service;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.SysOperationLog;
import com.injectmes.service.system.SystemBackupService;
import com.injectmes.service.system.SystemConfigFacadeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class SystemService {

    @Autowired
    private SystemConfigFacadeService systemConfigFacadeService;
    @Autowired
    private SystemBackupService systemBackupService;

    public R<Map<String, String>> getConfig() {
        return systemConfigFacadeService.getConfig();
    }

    public R<Void> updateConfig(Map<String, String> configMap) {
        return systemConfigFacadeService.updateConfig(configMap);
    }

    public R<PageResponse<SysOperationLog>> listLogs(PageRequest request) {
        return systemConfigFacadeService.listLogs(request);
    }

    public void recordLog(Long userId, String username, String module, String action,
                          String targetType, Long targetId, String oldValue, String newValue, String ip) {
        systemConfigFacadeService.recordLog(userId, username, module, action, targetType, targetId, oldValue, newValue, ip);
    }

    public R<Void> backup() {
        return systemBackupService.backup();
    }

    public R<Void> restore(String backupFile) {
        return systemBackupService.restore(backupFile);
    }

    public R<List<Map<String, Object>>> listBackups() {
        return systemBackupService.listBackups();
    }
}
