package com.injectmes.service.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.SysConfig;
import com.injectmes.entity.SysOperationLog;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.SysConfigMapper;
import com.injectmes.mapper.SysOperationLogMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SystemConfigService {

    @Autowired
    private SysConfigMapper sysConfigMapper;
    @Autowired
    private SysOperationLogMapper sysOperationLogMapper;

    public R<Map<String, String>> getConfig() {
        List<SysConfig> configs = sysConfigMapper.selectList(null);
        Map<String, String> configMap = new HashMap<>();
        for (SysConfig config : configs) {
            configMap.put(config.getConfigKey(), config.getConfigValue());
        }
        return R.ok(configMap);
    }

    @Transactional
    public R<Void> updateConfig(Map<String, String> configMap) {
        if (configMap == null || configMap.isEmpty()) {
            throw new BusinessException("配置项不能为空");
        }

        for (Map.Entry<String, String> entry : configMap.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();

            SysConfig existing = sysConfigMapper.selectOne(new LambdaQueryWrapper<SysConfig>()
                    .eq(SysConfig::getConfigKey, key));
            if (existing != null) {
                existing.setConfigValue(value);
                existing.setUpdatedAt(LocalDateTime.now());
                sysConfigMapper.updateById(existing);
            } else {
                SysConfig newConfig = new SysConfig();
                newConfig.setConfigKey(key);
                newConfig.setConfigValue(value);
                newConfig.setUpdatedAt(LocalDateTime.now());
                sysConfigMapper.insert(newConfig);
            }
        }

        return R.ok("配置更新成功", null);
    }

    public R<PageResponse<SysOperationLog>> listLogs(PageRequest request) {
        Page<SysOperationLog> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<SysOperationLog> wrapper = new LambdaQueryWrapper<>();

        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(SysOperationLog::getModule, keyword)
                    .or().like(SysOperationLog::getUsername, keyword)
                    .or().like(SysOperationLog::getAction, keyword)
            );
        }
        wrapper.orderByDesc(SysOperationLog::getCreatedAt);

        Page<SysOperationLog> result = sysOperationLogMapper.selectPage(page, wrapper);

        PageResponse<SysOperationLog> pageResponse = new PageResponse<>();
        pageResponse.setRecords(result.getRecords());
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());
        return R.ok(pageResponse);
    }

    @Transactional
    public void recordLog(Long userId, String username, String module, String action,
                          String targetType, Long targetId, String oldValue, String newValue, String ip) {
        SysOperationLog operationLog = new SysOperationLog();
        operationLog.setUserId(userId);
        operationLog.setUsername(username);
        operationLog.setModule(module);
        operationLog.setAction(action);
        operationLog.setTargetType(targetType);
        operationLog.setTargetId(targetId);
        operationLog.setOldValue(oldValue);
        operationLog.setNewValue(newValue);
        operationLog.setIp(ip);
        operationLog.setCreatedAt(LocalDateTime.now());
        sysOperationLogMapper.insert(operationLog);
    }
}
