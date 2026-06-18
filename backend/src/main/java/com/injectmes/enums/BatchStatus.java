package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 批次状态枚举
 */
@Getter
@AllArgsConstructor
public enum BatchStatus {
    NORMAL("正常"),
    LOCKED("锁定"),
    EXPIRED("过期"),
    RETURNED("已退回");

    private final String description;
}
