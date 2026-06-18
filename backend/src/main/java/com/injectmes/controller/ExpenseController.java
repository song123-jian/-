package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.ExpenseRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.ExpenseResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.ExpenseRecord;
import com.injectmes.mapper.ExpenseRecordMapper;
import com.injectmes.service.ExpenseService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

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

    @Autowired
    private ExpenseRecordMapper expenseRecordMapper;

    /**
     * 费用列表
     */
    @GetMapping("/expenses")
    public R<PageResponse<ExpenseResponse>> list(PageRequest request,
                                                   @RequestParam(required = false) String expenseType,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return expenseService.list(request, expenseType, startDate, endDate);
    }

    /**
     * 费用登记
     */
    @PostMapping("/expenses")
    public R<ExpenseResponse> create(@Valid @RequestBody ExpenseRequest request) {
        return expenseService.create(request);
    }

    /**
     * 更新费用
     */
    @PutMapping("/expenses/{id}")
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody ExpenseRequest request) {
        ExpenseRecord record = expenseRecordMapper.selectById(id);
        if (record == null) {
            return R.fail("费用记录不存在");
        }
        BeanUtils.copyProperties(request, record);
        record.setId(id);
        expenseRecordMapper.updateById(record);
        return R.ok("更新成功", null);
    }

    /**
     * 删除费用
     */
    @DeleteMapping("/expenses/{id}")
    public R<Void> delete(@PathVariable Long id) {
        expenseRecordMapper.deleteById(id);
        return R.ok("删除成功", null);
    }
}
