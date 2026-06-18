package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 费用类型枚举
 */
@Getter
@AllArgsConstructor
public enum ExpenseType {
    RENT("租金"),
    ELECTRICITY("电费"),
    WATER("水费"),
    MATERIAL("物料"),
    MAINTENANCE("维修"),
    SALARY("工资"),
    OTHER("其他");

    private final String description;
}
