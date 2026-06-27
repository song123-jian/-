package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.resp.FinanceSummaryResponse;
import com.injectmes.service.FinanceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 财务分析控制器
 */
@RestController
@RequestMapping("/api/finance")
@Validated
public class FinanceController {

    @Autowired
    private FinanceService financeService;

    @GetMapping("/statements")
    public R<FinanceSummaryResponse> statements(@RequestParam(required = false, defaultValue = "6") Integer months) {
        return financeService.statements(months);
    }
}
