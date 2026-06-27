package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.DeviceLabelRequest;
import com.injectmes.dto.req.DeviceScanRequest;
import com.injectmes.dto.req.DeviceScaleRequest;
import com.injectmes.dto.req.DeviceTelemetryRequest;
import com.injectmes.dto.req.PushTestRequest;
import com.injectmes.service.IntegrationService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 设备与消息集成控制器
 */
@RestController
@RequestMapping("/api/integrations")
@Validated
public class IntegrationController {

    @Autowired
    private IntegrationService integrationService;

    @PostMapping("/plc/telemetry")
    public R<Map<String, Object>> plcTelemetry(@Valid @RequestBody DeviceTelemetryRequest request) {
        return integrationService.processPlcTelemetry(request);
    }

    @PostMapping("/scan")
    public R<Map<String, Object>> scan(@Valid @RequestBody DeviceScanRequest request) {
        return integrationService.scan(request);
    }

    @PostMapping("/label/preview")
    public R<Map<String, Object>> labelPreview(@Valid @RequestBody DeviceLabelRequest request) {
        return integrationService.previewLabel(request);
    }

    @PostMapping("/scale")
    public R<Map<String, Object>> scale(@Valid @RequestBody DeviceScaleRequest request) {
        return integrationService.convertScale(request);
    }

    @PostMapping("/push/test")
    public R<Map<String, Object>> pushTest(@Valid @RequestBody PushTestRequest request) {
        return integrationService.pushTest(request);
    }
}
