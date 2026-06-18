package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 工资状态枚举
 */
@Getter
@AllArgsConstructor
public enum SalaryStatus {
    DRAFT("草稿"),
    CONFIRMED("已确认"),
    SETTLED("已结算");

    private final String description;
}
