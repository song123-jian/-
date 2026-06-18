package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 日工资表
 */
@Data
@TableName("salary_daily")
public class SalaryDaily {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private LocalDate workDate;
    private Integer totalQualifiedQty;
    private BigDecimal totalPieceAmount;
    private BigDecimal subsidy;
    private BigDecimal deduction;
    private BigDecimal totalAmount;
    private String status;
    private Long confirmedBy;
    private LocalDateTime confirmedAt;
    private LocalDateTime createdAt;
}
