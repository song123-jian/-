package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 工资调整表（奖惩/扣款）
 */
@Data
@TableName("salary_adjust")
public class SalaryAdjust {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String adjustType;
    private BigDecimal amount;
    private LocalDate adjustDate;
    private String reason;
    private Long createdBy;
    private LocalDateTime createdAt;
}
