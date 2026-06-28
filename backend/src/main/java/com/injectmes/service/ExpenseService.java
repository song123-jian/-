package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.ExpenseRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.ExpenseResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.ExpenseRecord;
import com.injectmes.entity.SysUser;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.ExpenseRecordMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 费用服务
 */
@Service
public class ExpenseService {

    @Autowired
    private ExpenseRecordMapper expenseRecordMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    /**
     * 费用登记
     * - 自动生成费用单号 EXP+YYYYMMDD+3位序号
     */
    @Transactional
    public R<ExpenseResponse> create(ExpenseRequest request) {
        // 自动生成费用单号 EXP+YYYYMMDD+3位序号
        String expenseNo = generateExpenseNo();

        ExpenseRecord record = new ExpenseRecord();
        record.setExpenseNo(expenseNo);
        record.setExpenseType(request.getExpenseType());
        record.setAmount(request.getAmount());
        record.setExpenseDate(request.getExpenseDate());
        record.setPayee(request.getPayee());
        record.setRemark(request.getRemark());
        record.setCreatedAt(LocalDateTime.now());
        expenseRecordMapper.insert(record);

        return R.ok(convertToResponse(record));
    }

    /**
     * 更新费用
     */
    @Transactional
    public R<ExpenseResponse> update(Long id, ExpenseRequest request) {
        ExpenseRecord record = requireRecord(id);
        record.setExpenseType(request.getExpenseType());
        record.setAmount(request.getAmount());
        record.setExpenseDate(request.getExpenseDate());
        record.setPayee(request.getPayee());
        record.setRemark(request.getRemark());
        expenseRecordMapper.updateById(record);
        return R.ok("更新成功", convertToResponse(record));
    }

    /**
     * 删除费用
     */
    @Transactional
    public R<Void> delete(Long id) {
        requireRecord(id);
        expenseRecordMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    /**
     * 费用列表（分页，支持expenseType/日期范围筛选）
     */
    public R<PageResponse<ExpenseResponse>> list(PageRequest request, String expenseType,
                                                  LocalDate startDate, LocalDate endDate) {
        Page<ExpenseRecord> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<ExpenseRecord> wrapper = new LambdaQueryWrapper<>();
        // 费用类型筛选
        if (expenseType != null && !expenseType.trim().isEmpty()) {
            wrapper.eq(ExpenseRecord::getExpenseType, expenseType);
        }
        // 日期范围筛选
        if (startDate != null) {
            wrapper.ge(ExpenseRecord::getExpenseDate, startDate);
        }
        if (endDate != null) {
            wrapper.le(ExpenseRecord::getExpenseDate, endDate);
        }
        // 关键词搜索收款人
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(ExpenseRecord::getPayee, keyword);
        }
        wrapper.orderByDesc(ExpenseRecord::getCreatedAt);

        Page<ExpenseRecord> result = expenseRecordMapper.selectPage(page, wrapper);

        List<ExpenseResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<ExpenseResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 生成费用单号：EXP+YYYYMMDD+3位序号（如EXP20260617001）
     */
    private String generateExpenseNo() {
        return seqNumberService.generateNo("EXP", 3);
    }

    private ExpenseRecord requireRecord(Long id) {
        ExpenseRecord record = expenseRecordMapper.selectById(id);
        if (record == null) {
            throw new BusinessException("费用记录不存在");
        }
        return record;
    }

    /**
     * 实体转响应DTO
     */
    private ExpenseResponse convertToResponse(ExpenseRecord record) {
        ExpenseResponse response = new ExpenseResponse();
        BeanUtils.copyProperties(record, response);

        // 查询创建人名称
        if (record.getCreatedBy() != null) {
            SysUser user = sysUserMapper.selectById(record.getCreatedBy());
            if (user != null) {
                response.setCreatorName(user.getRealName());
            }
        }

        return response;
    }
}
