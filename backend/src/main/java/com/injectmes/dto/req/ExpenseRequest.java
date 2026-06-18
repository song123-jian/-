package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 费用请求
 */
@Data
public class ExpenseRequest {

    /** 费用类型 */
    @NotNull(message = "费用类型不能为空")
    @Size(max = 50, message = "费用类型长度不能超过50")
    private String expenseType;

    /** 金额 */
    @NotNull(message = "金额不能为空")
    private BigDecimal amount;

    /** 费用日期 */
    @NotNull(message = "费用日期不能为空")
    private LocalDate expenseDate;

    /** 收款人 */
    @Size(max = 50, message = "收款人长度不能超过50")
    private String payee;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
