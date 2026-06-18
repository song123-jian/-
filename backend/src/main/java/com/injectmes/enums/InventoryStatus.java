package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 盘点单状态枚举
 */
@Getter
@AllArgsConstructor
public enum InventoryStatus {
    DRAFT("草稿"),
    COUNTING("盘点中"),
    PENDING_APPROVE("待审批"),
    FINISHED("已完成"),
    CANCELLED("已取消");

    private final String description;
}
