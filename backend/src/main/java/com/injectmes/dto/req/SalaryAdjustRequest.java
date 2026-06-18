package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 薪资调整请求
 */
@Data
public class SalaryAdjustRequest {

    /** 用户ID */
    @NotNull(message = "用户不能为空")
    private Long userId;

    /** 调整类型 */
    @Size(max = 20, message = "调整类型长度不能超过20")
    private String adjustType;

    /** 金额 */
    @NotNull(message = "金额不能为空")
    private BigDecimal amount;

    /** 调整日期 */
    @NotNull(message = "调整日期不能为空")
    private LocalDate adjustDate;

    /** 原因 */
    @Size(max = 500, message = "原因长度不能超过500")
    private String reason;
}
