package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 薪资调整响应
 */
@Data
public class SalaryAdjustResponse {

    /** ID */
    private Long id;

    /** 用户ID */
    private Long userId;

    /** 用户名 */
    private String username;

    /** 真实姓名 */
    private String realName;

    /** 调整类型 */
    private String adjustType;

    /** 金额 */
    private BigDecimal amount;

    /** 调整日期 */
    private LocalDate adjustDate;

    /** 原因 */
    private String reason;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
