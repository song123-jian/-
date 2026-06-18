package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 工资调整类型枚举
 */
@Getter
@AllArgsConstructor
public enum AdjustType {
    BONUS("奖金"),
    PENALTY("罚款"),
    OVERTIME("加班费"),
    SUBSIDY("补贴"),
    OTHER("其他");

    private final String description;
}
