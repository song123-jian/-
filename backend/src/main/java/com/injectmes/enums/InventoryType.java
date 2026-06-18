package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 盘点类型枚举
 */
@Getter
@AllArgsConstructor
public enum InventoryType {
    FULL("全盘"),
    PARTIAL("抽盘");

    private final String description;
}
