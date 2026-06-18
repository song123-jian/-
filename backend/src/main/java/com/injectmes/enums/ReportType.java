package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 报工类型枚举
 */
@Getter
@AllArgsConstructor
public enum ReportType {
    START("开工"),
    OUTPUT("产出"),
    END("完工");

    private final String description;
}
