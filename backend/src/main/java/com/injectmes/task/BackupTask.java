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
 * - 执行mysqldump全量备份
 * - 压缩备份文件
 * - 保留30天
 */
@Component
public class BackupTask {

    private static final Logger log = LoggerFactory.getLogger(BackupTask.class);

    /** 默认备份保留天数 */
    private static final int DEFAULT_KEEP_DAYS = 30;

    @Autowired
    private SysConfigMapper sysConfigMapper;

    @Value("${spring.datasource.url:jdbc:mysql://localhost:3306/inject_erp}")
    private String dbUrl;

    @Value("${spring.datasource.username:root}")
    private String dbUsername;

    @Value("${spring.datasource.password:}")
    private String dbPassword;

    @Value("${backup.path:./backup}")
    private String backupPath;

    /**
     * 每日凌晨2:00执行备份
     * - 执行mysqldump全量备份
     * - 压缩备份文件
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

            // 执行mysqldump全量备份
            executeMysqldump(sqlFilePath);

            // 压缩备份文件
            String zipFilePath = sqlFilePath.replace(".sql", ".zip");
            compressFile(sqlFilePath, zipFilePath);

            // 删除原始SQL文件
            Files.deleteIfExists(Paths.get(sqlFilePath));

            // 清理过期备份
            cleanOldBackups(backupDir, keepDays);

            log.info("========== 数据库备份完成，文件：{} ==========", zipFilePath);
        } catch (Exception e) {
            log.error("数据库备份失败：{}", e.getMessage(), e);
        }
    }

    /**
     * 执行mysqldump命令
     */
    private void executeMysqldump(String outputFile) throws IOException, InterruptedException {
        String dbName = extractDbName();
        String host = extractDbHost();
        String port = extractDbPort();

        ProcessBuilder processBuilder = new ProcessBuilder(
                "mysqldump",
                "-h", host,
                "-P", port,
                "-u", dbUsername,
                "-p" + dbPassword,
                "--single-transaction",
                "--routines",
                "--triggers",
                "--result-file=" + outputFile,
                dbName
        );

        processBuilder.redirectErrorStream(true);
        Process process = processBuilder.start();

        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new RuntimeException("mysqldump执行失败，退出码：" + exitCode);
        }

        log.info("mysqldump执行成功，输出文件：{}", outputFile);
    }

    /**
     * 压缩文件
     */
    private void compressFile(String sourcePath, String targetPath) throws IOException, InterruptedException {
        ProcessBuilder processBuilder = new ProcessBuilder(
                "zip", "-j", targetPath, sourcePath
        );
        processBuilder.redirectErrorStream(true);
        Process process = processBuilder.start();

        int exitCode = process.waitFor();
        if (exitCode != 0) {
            log.warn("压缩备份文件失败，退出码：{}，保留原始SQL文件", exitCode);
        } else {
            log.info("压缩备份文件成功：{}", targetPath);
        }
    }

    /**
     * 清理过期备份
     */
    private void cleanOldBackups(Path backupDir, int keepDays) {
        LocalDate cutoffDate = LocalDate.now().minusDays(keepDays);

        try (Stream<Path> paths = Files.list(backupDir)) {
            paths.filter(path -> path.toString().endsWith(".zip") || path.toString().endsWith(".sql"))
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
        // jdbc:mysql://localhost:3306/inject_erp -> inject_erp
        try {
            String url = dbUrl;
            int lastSlash = url.lastIndexOf('/');
            if (lastSlash >= 0) {
                String dbPart = url.substring(lastSlash + 1);
                // 去除可能的参数
                int questionMark = dbPart.indexOf('?');
                if (questionMark >= 0) {
                    dbPart = dbPart.substring(0, questionMark);
                }
                return dbPart;
            }
        } catch (Exception e) {
            // 忽略
        }
        return "inject_erp";
    }

    /**
     * 从数据源URL中提取主机地址
     */
    private String extractDbHost() {
        try {
            // jdbc:mysql://localhost:3306/inject_erp -> localhost
            String url = dbUrl;
            int start = url.indexOf("//") + 2;
            int end = url.indexOf(':', start);
            if (start > 0 && end > start) {
                return url.substring(start, end);
            }
        } catch (Exception e) {
            // 忽略
        }
        return "localhost";
    }

    /**
     * 从数据源URL中提取端口
     */
    private String extractDbPort() {
        try {
            // jdbc:mysql://localhost:3306/inject_erp -> 3306
            String url = dbUrl;
            int start = url.indexOf("//") + 2;
            int colonIndex = url.indexOf(':', start);
            int slashIndex = url.indexOf('/', colonIndex);
            if (colonIndex > 0 && slashIndex > colonIndex) {
                return url.substring(colonIndex + 1, slashIndex);
            }
        } catch (Exception e) {
            // 忽略
        }
        return "3306";
    }
}
