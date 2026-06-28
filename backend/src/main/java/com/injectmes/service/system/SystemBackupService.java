package com.injectmes.service.system;

import com.injectmes.common.R;
import com.injectmes.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SystemBackupService {

    private static final Logger log = LoggerFactory.getLogger(SystemBackupService.class);

    @Value("${spring.datasource.url}")
    private String dbUrl;

    @Value("${spring.datasource.username}")
    private String dbUsername;

    @Value("${spring.datasource.password}")
    private String dbPassword;

    @Value("${file.upload-path:./uploads/}")
    private String uploadPath;

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

    public R<Void> backup() {
        try {
            String dbName = parseDbName(dbUrl);
            String dbHost = parseDbHost(dbUrl);
            String dbPort = parseDbPort(dbUrl);

            Path backupDir = Paths.get(uploadPath, "backups");
            Files.createDirectories(backupDir);

            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
            String backupFileName = "inject_erp_" + timestamp + ".sql";
            Path backupFile = backupDir.resolve(backupFileName);

            ProcessBuilder processBuilder = new ProcessBuilder(
                    "pg_dump",
                    "-h" + dbHost,
                    "-p" + dbPort,
                    "-U", dbUsername,
                    "--no-owner",
                    "--no-privileges",
                    "--format=plain",
                    "-f", backupFile.toString(),
                    dbName
            );
            processBuilder.environment().put("PGPASSWORD", dbPassword);
            processBuilder.environment().put("PGSSLMODE", dbSslMode(dbUrl));

            log.info("开始备份数据库: {} -> {}", dbName, backupFile);
            Process process = processBuilder.start();
            int exitCode = process.waitFor();

            if (exitCode == 0) {
                log.info("数据库备份成功: {}", backupFile);
                return R.ok("备份成功，文件: " + backupFileName, null);
            }

            String errorMsg;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream()))) {
                errorMsg = reader.lines().collect(Collectors.joining("\n"));
            }
            log.error("数据库备份失败: {}", errorMsg);
            throw new BusinessException("数据库备份失败: " + errorMsg);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("数据库备份异常", e);
            throw new BusinessException("数据库备份异常: " + e.getMessage());
        }
    }

    public R<Void> restore(String backupFile) {
        try {
            String dbName = parseDbName(dbUrl);
            String dbHost = parseDbHost(dbUrl);
            String dbPort = parseDbPort(dbUrl);

            Path backupPath = Paths.get(uploadPath, "backups", backupFile);
            if (!Files.exists(backupPath)) {
                throw new BusinessException("备份文件不存在: " + backupFile);
            }

            ProcessBuilder processBuilder = new ProcessBuilder(
                    "psql",
                    "-h" + dbHost,
                    "-p" + dbPort,
                    "-U", dbUsername,
                    "-d", dbName,
                    "-v", "ON_ERROR_STOP=1",
                    "-f", backupPath.toString()
            );
            processBuilder.environment().put("PGPASSWORD", dbPassword);
            processBuilder.environment().put("PGSSLMODE", dbSslMode(dbUrl));

            log.info("开始恢复数据库: {} <- {}", dbName, backupPath);
            Process process = processBuilder.start();
            int exitCode = process.waitFor();

            if (exitCode == 0) {
                log.info("数据库恢复成功");
                return R.ok("恢复成功", null);
            }

            String errorMsg;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getErrorStream()))) {
                errorMsg = reader.lines().collect(Collectors.joining("\n"));
            }
            log.error("数据库恢复失败: {}", errorMsg);
            throw new BusinessException("数据库恢复失败: " + errorMsg);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("数据库恢复异常", e);
            throw new BusinessException("数据库恢复异常: " + e.getMessage());
        }
    }

    private String parseDbName(String url) {
        JdbcParts parts = parseJdbcUrl(url);
        if (parts.dbName == null || parts.dbName.isBlank()) {
            throw new BusinessException("无法解析数据库名: " + url);
        }
        return parts.dbName;
    }

    private String parseDbHost(String url) {
        return parseJdbcUrl(url).host;
    }

    private String parseDbPort(String url) {
        return parseJdbcUrl(url).port;
    }

    private String dbSslMode(String url) {
        int queryIdx = url.indexOf('?');
        if (queryIdx < 0) {
            return "require";
        }
        String query = url.substring(queryIdx + 1);
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2 && "sslmode".equalsIgnoreCase(kv[0]) && !kv[1].isBlank()) {
                return kv[1];
            }
        }
        return "require";
    }

    private JdbcParts parseJdbcUrl(String url) {
        if (url == null || !url.startsWith("jdbc:")) {
            throw new BusinessException("无法解析JDBC地址: " + url);
        }

        String stripped = url.substring("jdbc:".length());
        int schemeIdx = stripped.indexOf("://");
        if (schemeIdx < 0) {
            throw new BusinessException("无法解析JDBC地址: " + url);
        }

        String remainder = stripped.substring(schemeIdx + 3);
        int slashIdx = remainder.indexOf('/');
        if (slashIdx < 0) {
            throw new BusinessException("无法解析数据库地址: " + url);
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
