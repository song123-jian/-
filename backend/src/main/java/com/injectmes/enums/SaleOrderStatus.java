package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 销售订单状态枚举
 */
@Getter
@AllArgsConstructor
public enum SaleOrderStatus {
    DRAFT("草稿"),
    CONFIRMED("已确认"),
    PRODUCING("生产中"),
    DELIVERED("已发货"),
    CLOSED("已关闭"),
    CANCELLED("已取消");

    private final String description;
}
