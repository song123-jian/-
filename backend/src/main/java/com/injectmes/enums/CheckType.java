package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 质检类型枚举
 */
@Getter
@AllArgsConstructor
public enum CheckType {
    IQC("来料检验"),
    FAI("首件检验"),
    IPQC("过程检验"),
    FQC("成品检验");

    private final String description;
}
