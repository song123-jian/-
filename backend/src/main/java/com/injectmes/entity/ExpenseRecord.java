package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 费用支出表
 */
@Data
@TableName("expense_record")
public class ExpenseRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String expenseNo;
    private String expenseType;
    private BigDecimal amount;
    private LocalDate expenseDate;
    private String payee;
    private String remark;
    private Long createdBy;
    private LocalDateTime createdAt;
}
