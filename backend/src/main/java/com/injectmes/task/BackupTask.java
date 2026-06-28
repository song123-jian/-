package com.injectmes.task;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.entity.SysConfig;
import com.injectmes.mapper.SysConfigMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.stream.Stream;

/**
 * 备份定时任务
 * 每日凌晨2:00执行备份
 * - 执行pg_dump全量备份
 * - 保留30天
 */
@Component
public class BackupTask {

    private static final Logger log = LoggerFactory.getLogger(BackupTask.class);

    /** 默认备份保留天数 */
    private static final int DEFAULT_KEEP_DAYS = 30;

    @Autowired
    private SysConfigMapper sysConfigMapper;

    @Value("${spring.datasource.url:jdbc:postgresql://localhost:5432/inject_erp}")
    private String dbUrl;

    @Value("${spring.datasource.username:root}")
    private String dbUsername;

    @Value("${spring.datasource.password:}")
    private String dbPassword;

    @Value("${backup.path:./backup}")
    private String backupPath;

    /**
     * 每日凌晨2:00执行备份
     * - 执行pg_dump全量备份
     * - 保留30天
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void backup() {
        log.info("========== 开始执行数据库备份 ==========");

        try {
            // 从系统配置读取保留天数
            int keepDays = getKeepDays();

            // 确保备份目录存在
            Path backupDir = Paths.get(backupPath);
            if (!Files.exists(backupDir)) {
                Files.createDirectories(backupDir);
                log.info("创建备份目录：{}", backupDir.toAbsolutePath());
            }

            // 生成备份文件名
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
            String dbName = extractDbName();
            String sqlFileName = String.format("%s_%s.sql", dbName, timestamp);
            String sqlFilePath = backupDir.resolve(sqlFileName).toString();

            // 执行pg_dump全量备份
            executePgDump(sqlFilePath);

            // 清理过期备份
            cleanOldBackups(backupDir, keepDays);

            log.info("========== 数据库备份完成，文件：{} ==========", sqlFilePath);
        } catch (Exception e) {
            log.error("数据库备份失败：{}", e.getMessage(), e);
        }
    }

    /**
     * 执行pg_dump命令
     */
    private void executePgDump(String outputFile) throws IOException, InterruptedException {
        String dbName = extractDbName();
        String host = extractDbHost();
        String port = extractDbPort();

        ProcessBuilder processBuilder = new ProcessBuilder(
                "pg_dump",
                "-h", host,
                "-p", port,
                "-U", dbUsername,
                "--no-owner",
                "--no-privileges",
                "--format=plain",
                "-f", outputFile,
                dbName
        );

        processBuilder.environment().put("PGPASSWORD", dbPassword);
        processBuilder.environment().put("PGSSLMODE", extractSslMode());
        processBuilder.redirectErrorStream(true);
        Process process = processBuilder.start();

        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new RuntimeException("pg_dump执行失败，退出码：" + exitCode);
        }

        log.info("pg_dump执行成功，输出文件：{}", outputFile);
    }

    /**
     * 清理过期备份
     */
    private void cleanOldBackups(Path backupDir, int keepDays) {
        LocalDate cutoffDate = LocalDate.now().minusDays(keepDays);

        try (Stream<Path> paths = Files.list(backupDir)) {
            paths.filter(path -> path.toString().endsWith(".sql"))
                    .forEach(path -> {
                        try {
                            LocalDate fileDate = LocalDate.ofEpochDay(
                                    Files.getLastModifiedTime(path).toMillis() / (24 * 60 * 60 * 1000)
                            );
                            if (fileDate.isBefore(cutoffDate)) {
                                Files.deleteIfExists(path);
                                log.info("删除过期备份文件：{}", path.getFileName());
                            }
                        } catch (IOException e) {
                            log.warn("删除过期备份文件失败：{}，原因：{}", path.getFileName(), e.getMessage());
                        }
                    });
        } catch (IOException e) {
            log.warn("扫描备份目录失败：{}", e.getMessage());
        }
    }

    /**
     * 从系统配置获取备份保留天数
     */
    private int getKeepDays() {
        try {
            LambdaQueryWrapper<SysConfig> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(SysConfig::getConfigKey, "backup_keep_days");
            SysConfig config = sysConfigMapper.selectOne(wrapper);
            if (config != null && config.getConfigValue() != null) {
                return Integer.parseInt(config.getConfigValue());
            }
        } catch (Exception e) {
            log.warn("读取备份保留天数配置失败，使用默认值：{}", DEFAULT_KEEP_DAYS);
        }
        return DEFAULT_KEEP_DAYS;
    }

    /**
     * 从数据源URL中提取数据库名
     */
    private String extractDbName() {
        return parseJdbcParts().dbName();
    }

    /**
     * 从数据源URL中提取主机地址
     */
    private String extractDbHost() {
        return parseJdbcParts().host();
    }

    /**
     * 从数据源URL中提取端口
     */
    private String extractDbPort() {
        return parseJdbcParts().port();
    }

    private String extractSslMode() {
        int questionIdx = dbUrl.indexOf('?');
        if (questionIdx < 0) {
            return "require";
        }
        String query = dbUrl.substring(questionIdx + 1);
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2 && "sslmode".equalsIgnoreCase(kv[0]) && !kv[1].isBlank()) {
                return kv[1];
            }
        }
        return "require";
    }

    private JdbcParts parseJdbcParts() {
        if (dbUrl == null || !dbUrl.startsWith("jdbc:")) {
            return new JdbcParts("localhost", "5432", "inject_erp");
        }

        String stripped = dbUrl.substring("jdbc:".length());
        int schemeIdx = stripped.indexOf("://");
        String remainder = schemeIdx >= 0 ? stripped.substring(schemeIdx + 3) : stripped;
        int slashIdx = remainder.indexOf('/');
        if (slashIdx < 0) {
            return new JdbcParts("localhost", "5432", "inject_erp");
        }

        String hostPort = remainder.substring(0, slashIdx);
        String dbPart = remainder.substring(slashIdx + 1);
        int questionIdx = dbPart.indexOf('?');
        if (questionIdx >= 0) {
            dbPart = dbPart.substring(0, questionIdx);
        }

        int colonIdx = hostPort.lastIndexOf(':');
        String host = colonIdx >= 0 ? hostPort.substring(0, colonIdx) : hostPort;
        String port = colonIdx >= 0 ? hostPort.substring(colonIdx + 1) : "5432";
        return new JdbcParts(host, port, dbPart);
    }

    private record JdbcParts(String host, String port, String dbName) {
    }
}
