package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 用户角色枚举
 */
@Getter
@AllArgsConstructor
public enum UserRole {
    BOSS("老板/厂长"),
    PROD_MANAGER("生产主管"),
    OPERATOR("操作工"),
    QC("品质人员"),
    SALES("销售"),
    FINANCE("财务");

    private final String description;
}
