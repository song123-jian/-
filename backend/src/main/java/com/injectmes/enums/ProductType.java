package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 产品类型枚举
 */
@Getter
@AllArgsConstructor
public enum ProductType {
    RAW("原料"),
    SEMI("半成品"),
    FINISH("成品");

    private final String description;
}
