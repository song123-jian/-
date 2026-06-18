package com.injectmes.service;

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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 系统管理服务
 * 提供系统配置管理、操作日志查询、数据库备份与恢复功能
 */
@Service
public class SystemService {

    private static final Logger log = LoggerFactory.getLogger(SystemService.class);

    @Autowired
    private SysConfigMapper sysConfigMapper;

    @Autowired
    private SysOperationLogMapper sysOperationLogMapper;

    /** 数据库连接地址 */
    @Value("${spring.datasource.url}")
    private String dbUrl;

    /** 数据库用户名 */
    @Value("${spring.datasource.username}")
    private String dbUsername;

    /** 数据库密码 */
    @Value("${spring.datasource.password}")
    private String dbPassword;

    /** 备份文件存储路径 */
    @Value("${file.upload-path:./uploads/}")
    private String uploadPath;

    /**
     * 获取系统配置
     * 将所有配置项按key-value形式返回
     *
     * @return 配置Map
     */
    public R<Map<String, String>> getConfig() {
        List<SysConfig> configs = sysConfigMapper.selectList(null);
        Map<String, String> configMap = new HashMap<>();
        for (SysConfig config : configs) {
            configMap.put(config.getConfigKey(), config.getConfigValue());
        }
        return R.ok(configMap);
    }

    /**
     * 更新系统配置
     * 按key逐项更新配置值，不存在则新增
     *
     * @param configMap 配置键值对
     * @return 操作结果
     */
    @Transactional
    public R<Void> updateConfig(Map<String, String> configMap) {
        if (configMap == null || configMap.isEmpty()) {
            throw new BusinessException("配置项不能为空");
        }

        for (Map.Entry<String, String> entry : configMap.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();

            // 查询是否已存在该配置项
            LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysConfig::getConfigKey, key);
            SysConfig existing = sysConfigMapper.selectOne(wrapper);

            if (existing != null) {
                // 更新已有配置
                existing.setConfigValue(value);
                existing.setUpdatedAt(LocalDateTime.now());
                sysConfigMapper.updateById(existing);
            } else {
                // 新增配置项
                SysConfig newConfig = new SysConfig();
                newConfig.setConfigKey(key);
                newConfig.setConfigValue(value);
                newConfig.setUpdatedAt(LocalDateTime.now());
                sysConfigMapper.insert(newConfig);
            }
        }

        return R.ok("配置更新成功", null);
    }

    /**
     * 操作日志列表（分页）
     * 支持按关键词模糊搜索模块名或用户名
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<SysOperationLog>> listLogs(PageRequest request) {
        Page<SysOperationLog> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<SysOperationLog> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(SysOperationLog::getModule, keyword)
                    .or().like(SysOperationLog::getUsername, keyword)
                    .or().like(SysOperationLog::getAction, keyword)
            );
        }

        // 按创建时间降序
        wrapper.orderByDesc(SysOperationLog::getCreatedAt);

        Page<SysOperationLog> result = sysOperationLogMapper.selectPage(page, wrapper);

        PageResponse<SysOperationLog> pageResponse = new PageResponse<>();
        pageResponse.setRecords(result.getRecords());
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 记录操作日志（内部方法）
     * 由AOP切面或其他业务方法调用
     *
     * @param userId     操作用户ID
     * @param username   操作用户名
     * @param module     操作模块
     * @param action     操作动作
     * @param targetType 目标类型
     * @param targetId   目标ID
     * @param oldValue   操作前值
     * @param newValue   操作后值
     * @param ip         操作IP地址
     */
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

    /**
     * 手动备份数据库
     * 使用mysqldump命令导出数据库到SQL文件
     *
     * @return 操作结果
     */
    public R<Void> backup() {
        try {
            // 从JDBC URL中解析数据库名和主机
            String dbName = parseDbName(dbUrl);
            String dbHost = parseDbHost(dbUrl);

            // 创建备份目录
            Path backupDir = Paths.get(uploadPath, "backups");
            Files.createDirectories(backupDir);

            // 生成备份文件名（含时间戳）
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
            String backupFileName = "inject_erp_" + timestamp + ".sql";
            Path backupFile = backupDir.resolve(backupFileName);

            // 构建mysqldump命令
            ProcessBuilder processBuilder = new ProcessBuilder(
                    "mysqldump",
                    "-h" + dbHost,
                    "-u" + dbUsername,
                    "-p" + dbPassword,
                    "--single-transaction",
                    "--routines",
                    "--triggers",
                    dbName,
                    "-r", backupFile.toString()
            );

            // 设置字符集为UTF-8
            processBuilder.environment().put("MYSQL_PWD", dbPassword);

            log.info("开始备份数据库: {} -> {}", dbName, backupFile);

            Process process = processBuilder.start();
            int exitCode = process.waitFor();

            if (exitCode == 0) {
                log.info("数据库备份成功: {}", backupFile);
                return R.ok("备份成功，文件: " + backupFileName, null);
            } else {
                // 读取错误信息
                String errorMsg;
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getErrorStream()))) {
                    errorMsg = reader.lines().collect(Collectors.joining("\n"));
                }
                log.error("数据库备份失败: {}", errorMsg);
                throw new BusinessException("数据库备份失败: " + errorMsg);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("数据库备份异常", e);
            throw new BusinessException("数据库备份异常: " + e.getMessage());
        }
    }

    /**
     * 恢复备份
     * 使用mysql命令从SQL文件恢复数据库
     *
     * @param backupFile 备份文件名
     * @return 操作结果
     */
    public R<Void> restore(String backupFile) {
        try {
            String dbName = parseDbName(dbUrl);
            String dbHost = parseDbHost(dbUrl);

            // 验证备份文件是否存在
            Path backupPath = Paths.get(uploadPath, "backups", backupFile);
            if (!Files.exists(backupPath)) {
                throw new BusinessException("备份文件不存在: " + backupFile);
            }

            // 构建mysql恢复命令
            ProcessBuilder processBuilder = new ProcessBuilder(
                    "mysql",
                    "-h" + dbHost,
                    "-u" + dbUsername,
                    "-p" + dbPassword,
                    dbName,
                    "-e", "source " + backupPath.toString()
            );

            processBuilder.environment().put("MYSQL_PWD", dbPassword);

            log.info("开始恢复数据库: {} <- {}", dbName, backupPath);

            Process process = processBuilder.start();
            int exitCode = process.waitFor();

            if (exitCode == 0) {
                log.info("数据库恢复成功");
                return R.ok("恢复成功", null);
            } else {
                String errorMsg;
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getErrorStream()))) {
                    errorMsg = reader.lines().collect(Collectors.joining("\n"));
                }
                log.error("数据库恢复失败: {}", errorMsg);
                throw new BusinessException("数据库恢复失败: " + errorMsg);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("数据库恢复异常", e);
            throw new BusinessException("数据库恢复异常: " + e.getMessage());
        }
    }

    /**
     * 从JDBC URL解析数据库名
     * 例如: jdbc:mysql://localhost:3306/inject_erp?... -> inject_erp
     */
    private String parseDbName(String url) {
        // 去掉jdbc:mysql://前缀
        String stripped = url.substring("jdbc:mysql://".length());
        // 取第一个/之后、?之前的部分
        int slashIdx = stripped.indexOf('/');
        int questionIdx = stripped.indexOf('?');
        if (slashIdx < 0) {
            throw new BusinessException("无法解析数据库名: " + url);
        }
        if (questionIdx > slashIdx) {
            return stripped.substring(slashIdx + 1, questionIdx);
        }
        return stripped.substring(slashIdx + 1);
    }

    /**
     * 从JDBC URL解析主机地址
     * 例如: jdbc:mysql://localhost:3306/inject_erp?... -> localhost:3306
     */
    private String parseDbHost(String url) {
        String stripped = url.substring("jdbc:mysql://".length());
        int slashIdx = stripped.indexOf('/');
        if (slashIdx < 0) {
            throw new BusinessException("无法解析数据库主机: " + url);
        }
        return stripped.substring(0, slashIdx);
    }
}
