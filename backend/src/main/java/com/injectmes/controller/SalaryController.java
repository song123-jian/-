package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.PiecePriceRequest;
import com.injectmes.dto.req.SalaryAdjustRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.PiecePriceResponse;
import com.injectmes.dto.resp.SalaryAdjustResponse;
import com.injectmes.dto.resp.SalaryDailyResponse;
import com.injectmes.service.SalaryService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 工资管理控制器
 */
@RestController
@RequestMapping("/api/salary")
@Validated
public class SalaryController {

    @Autowired
    private SalaryService salaryService;

    @GetMapping("/prices")
    public R<PageResponse<PiecePriceResponse>> listPrices(PageRequest request,
                                                          @RequestParam(name = "productId", required = false) Long productId) {
        return salaryService.listPrices(request, productId);
    }

    @PostMapping("/prices")
    public R<PiecePriceResponse> setPrice(@Valid @RequestBody PiecePriceRequest request) {
        return salaryService.setPrice(request);
    }

    @GetMapping("/daily")
    public R<PageResponse<SalaryDailyResponse>> listDaily(PageRequest request,
                                                          @RequestParam(name = "userId", required = false) Long userId,
                                                          @RequestParam(name = "startDate", required = false)
                                                          @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                          @RequestParam(name = "endDate", required = false)
                                                          @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return salaryService.listDaily(request, userId, startDate, endDate);
    }

    @PostMapping("/daily/calculate")
    public R<SalaryDailyResponse> calculateDaily(@RequestParam(name = "userId") Long userId,
                                                 @RequestParam(name = "workDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate workDate) {
        return salaryService.calculateDaily(userId, workDate);
    }

    @GetMapping("/monthly")
    public R<Map<String, Object>> monthlySummary(@RequestParam(name = "userId") Long userId,
                                                 @RequestParam(name = "month") String month) {
        return salaryService.monthlySummary(userId, month);
    }

    @GetMapping("/summary")
    public R<Map<String, Object>> summary(@RequestParam(name = "year", required = false) Integer year,
                                          @RequestParam(name = "month", required = false) Integer month,
                                          @RequestParam(name = "userId", required = false) Long userId) {
        Map<String, Object> result = new HashMap<>();
        if (year == null || month == null || userId == null) {
            result.put("baseSalary", 0);
            result.put("pieceAmount", 0);
            result.put("overtimeAmount", 0);
            result.put("deduction", 0);
            result.put("totalAmount", 0);
            return R.ok(result);
        }
        String monthText = String.format("%04d-%02d", year, month);
        Map<String, Object> monthly = salaryService.monthlySummary(userId, monthText).getData();
        result.put("baseSalary", 0);
        result.put("pieceAmount", monthly.getOrDefault("dailyTotal", 0));
        result.put("overtimeAmount", monthly.getOrDefault("monthBonus", 0));
        result.put("deduction", monthly.getOrDefault("monthPenalty", 0));
        result.put("totalAmount", monthly.getOrDefault("monthlySalary", 0));
        return R.ok(result);
    }

    @GetMapping("/daily-details")
    public R<List<Map<String, Object>>> dailyDetails(@RequestParam(name = "year") Integer year,
                                                     @RequestParam(name = "month") Integer month,
                                                     @RequestParam(name = "userId", required = false) Long userId) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (userId == null) {
            return R.ok(rows);
        }
        String monthText = String.format("%04d-%02d", year, month);
        Map<String, Object> monthly = salaryService.monthlySummary(userId, monthText).getData();
        Map<String, Object> row = new HashMap<>();
        row.put("date", monthText + "-01");
        row.put("workHours", 0);
        row.put("pieceCount", 0);
        row.put("pieceAmount", monthly.getOrDefault("dailyTotal", 0));
        row.put("overtimeHours", 0);
        row.put("overtimeAmount", monthly.getOrDefault("monthBonus", 0));
        row.put("dailyTotal", monthly.getOrDefault("monthlySalary", 0));
        rows.add(row);
        return R.ok(rows);
    }

    @PostMapping("/adjust")
    public R<SalaryAdjustResponse> adjust(@Valid @RequestBody SalaryAdjustRequest request) {
        return salaryService.adjust(request);
    }

    @GetMapping("/adjusts")
    public R<PageResponse<SalaryAdjustResponse>> listAdjusts(PageRequest request,
                                                             @RequestParam(name = "userId", required = false) Long userId,
                                                             @RequestParam(name = "adjustType", required = false) String adjustType) {
        return salaryService.listAdjusts(request, userId, adjustType);
    }

    @PutMapping("/prices/{id}")
    public R<PiecePriceResponse> updatePrice(@PathVariable Long id, @Valid @RequestBody PiecePriceRequest request) {
        return salaryService.updatePrice(id, request);
    }

    @DeleteMapping("/prices/{id}")
    public R<Void> deletePrice(@PathVariable Long id) {
        return salaryService.deletePrice(id);
    }

    @PostMapping("/monthly/settle")
    public R<Void> monthlySettle(@RequestParam(name = "userId") Long userId, @RequestParam(name = "month") String month) {
        return salaryService.monthlySettle(userId, month);
    }

    @GetMapping("/adjust")
    public R<PageResponse<SalaryAdjustResponse>> listAdjust(PageRequest request,
                                                            @RequestParam(name = "userId", required = false) Long userId,
                                                            @RequestParam(name = "adjustType", required = false) String adjustType) {
        return salaryService.listAdjusts(request, userId, adjustType);
    }

    @PutMapping("/adjust/{id}")
    public R<SalaryAdjustResponse> updateAdjust(@PathVariable Long id, @Valid @RequestBody SalaryAdjustRequest request) {
        return salaryService.updateAdjust(id, request);
    }

    @DeleteMapping("/adjust/{id}")
    public R<Void> deleteAdjust(@PathVariable Long id) {
        return salaryService.deleteAdjust(id);
    }
}
