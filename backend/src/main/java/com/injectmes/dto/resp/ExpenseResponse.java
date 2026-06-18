package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 费用记录响应
 */
@Data
public class ExpenseResponse {

    /** ID */
    private Long id;

    /** 费用类型 */
    private String expenseType;

    /** 金额 */
    private BigDecimal amount;

    /** 费用日期 */
    private LocalDate expenseDate;

    /** 收款人 */
    private String payee;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String creatorName;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
