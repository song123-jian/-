package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 模具状态枚举
 */
@Getter
@AllArgsConstructor
public enum MoldStatus {
    NORMAL("正常"),
    REPAIR("维修中"),
    SCRAP("报废");

    private final String description;
}
