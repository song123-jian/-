package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 关联单据类型枚举
 */
@Getter
@AllArgsConstructor
public enum RelatedOrderType {
    SALE_ORDER("销售订单"),
    PROD_ORDER("生产工单"),
    PURCHASE_ORDER("采购订单"),
    TRANSFER("调拨单"),
    INVENTORY("盘点单");

    private final String description;
}
