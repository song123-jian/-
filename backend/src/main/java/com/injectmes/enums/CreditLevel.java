package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 信用等级枚举
 */
@Getter
@AllArgsConstructor
public enum CreditLevel {
    A("A级-优质"),
    B("B级-一般"),
    C("C级-风险");

    private final String description;
}
