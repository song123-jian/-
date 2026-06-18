package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 生产工单状态枚举
 */
@Getter
@AllArgsConstructor
public enum ProdOrderStatus {
    WAITING("待排产"),
    SCHEDULED("已排产"),
    RUNNING("生产中"),
    PAUSED("已暂停"),
    FINISHED("已完工"),
    CLOSED("已关闭");

    private final String description;
}
