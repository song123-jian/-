package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 质检结果枚举
 */
@Getter
@AllArgsConstructor
public enum CheckResult {
    PASS("合格"),
    FAIL("不合格"),
    CONDITIONAL("让步接收");

    private final String description;
}
