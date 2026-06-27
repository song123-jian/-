package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.injectmes.entity.SysConfig;
import com.injectmes.mapper.SysConfigMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 外部消息推送服务
 */
@Service
public class ExternalMessagePushService {

    private static final Logger log = LoggerFactory.getLogger(ExternalMessagePushService.class);

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    @Autowired
    private SysConfigMapper sysConfigMapper;

    @Autowired
    private ObjectMapper objectMapper;

    public Map<String, Object> push(String title, String content, String type) {
        Map<String, Object> result = new HashMap<>();
        boolean enabled = getBooleanConfig("external_push_enabled", false);
        result.put("enabled", enabled);
        result.put("channels", new ArrayList<>());

        if (!enabled) {
            result.put("message", "外部消息推送未启用");
            return result;
        }

        List<Map<String, Object>> channels = new ArrayList<>();
        sendIfConfigured("wecom", getConfigValue("wecom_webhook_url"), title, content, type, channels);
        sendIfConfigured("dingtalk", getConfigValue("dingtalk_webhook_url"), title, content, type, channels);

        result.put("channels", channels);
        return result;
    }

    private void sendIfConfigured(String channel, String webhookUrl, String title, String content, String type,
                                  List<Map<String, Object>> channels) {
        if (webhookUrl == null || webhookUrl.trim().isEmpty()) {
            Map<String, Object> skipped = new HashMap<>();
            skipped.put("channel", channel);
            skipped.put("status", "SKIPPED");
            skipped.put("message", "未配置Webhook");
            channels.add(skipped);
            return;
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("msgtype", "text");
        Map<String, Object> text = new HashMap<>();
        text.put("content", "[" + (type == null ? "INFO" : type) + "] " + title + "\n" + content);
        payload.put("text", text);

        Map<String, Object> channelResult = new HashMap<>();
        channelResult.put("channel", channel);
        channelResult.put("url", webhookUrl);

        try {
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(webhookUrl))
                    .timeout(TIMEOUT)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpClient client = HttpClient.newHttpClient();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            channelResult.put("status", response.statusCode() >= 200 && response.statusCode() < 300 ? "SUCCESS" : "FAILED");
            channelResult.put("httpStatus", response.statusCode());
            channelResult.put("response", response.body());
        } catch (Exception e) {
            log.warn("外部消息推送失败 channel={}, message={}", channel, e.getMessage());
            channelResult.put("status", "FAILED");
            channelResult.put("message", e.getMessage());
        }

        channels.add(channelResult);
    }

    private String getConfigValue(String key) {
        SysConfig config = sysConfigMapper.selectOne(new LambdaQueryWrapper<SysConfig>().eq(SysConfig::getConfigKey, key));
        return config != null ? config.getConfigValue() : null;
    }

    private boolean getBooleanConfig(String key, boolean defaultValue) {
        String value = getConfigValue(key);
        if (value == null) {
            return defaultValue;
        }
        return "true".equalsIgnoreCase(value) || "1".equals(value) || "yes".equalsIgnoreCase(value);
    }
}
