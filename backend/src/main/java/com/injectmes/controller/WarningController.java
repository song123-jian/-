package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.service.WarningService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 预警中心控制器
 */
@RestController
@RequestMapping("/api/warnings")
public class WarningController {

    @Autowired
    private WarningService warningService;

    /**
     * 预警汇总列表
     */
    @GetMapping
    public R<List<Map<String, Object>>> list() {
        List<Map<String, Object>> warnings = warningService.listWarnings();
        return R.ok(warnings);
    }

    /**
     * 预警统计
     */
    @GetMapping("/summary")
    public R<Map<String, Object>> summary() {
        return R.ok(warningService.summary());
    }
}
