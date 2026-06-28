package com.injectmes.service.system;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.SysOperationLog;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class SystemConfigFacadeService {

    @Autowired
    private SystemConfigService systemConfigService;

    public R<Map<String, String>> getConfig() {
        return systemConfigService.getConfig();
    }

    public R<Void> updateConfig(Map<String, String> configMap) {
        return systemConfigService.updateConfig(configMap);
    }

    public R<PageResponse<SysOperationLog>> listLogs(PageRequest request) {
        return systemConfigService.listLogs(request);
    }

    public void recordLog(Long userId, String username, String module, String action,
                          String targetType, Long targetId, String oldValue, String newValue, String ip) {
        systemConfigService.recordLog(userId, username, module, action, targetType, targetId, oldValue, newValue, ip);
    }
}
