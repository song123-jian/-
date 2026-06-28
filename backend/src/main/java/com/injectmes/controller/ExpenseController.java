package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.ExpenseRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.ExpenseResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.ExpenseService;
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

/**
 * 费用管理控制器
 */
@RestController
@RequestMapping("/api")
@Validated
public class ExpenseController {

    @Autowired
    private ExpenseService expenseService;

    @GetMapping("/expenses")
    public R<PageResponse<ExpenseResponse>> list(PageRequest request,
                                                 @RequestParam(name = "expenseType", required = false) String expenseType,
                                                 @RequestParam(name = "startDate", required = false)
                                                 @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                 @RequestParam(name = "endDate", required = false)
                                                 @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return expenseService.list(request, expenseType, startDate, endDate);
    }

    @PostMapping("/expenses")
    public R<ExpenseResponse> create(@Valid @RequestBody ExpenseRequest request) {
        return expenseService.create(request);
    }

    @PutMapping("/expenses/{id}")
    public R<ExpenseResponse> update(@PathVariable Long id, @Valid @RequestBody ExpenseRequest request) {
        return expenseService.update(id, request);
    }

    @DeleteMapping("/expenses/{id}")
    public R<Void> delete(@PathVariable Long id) {
        return expenseService.delete(id);
    }
}
