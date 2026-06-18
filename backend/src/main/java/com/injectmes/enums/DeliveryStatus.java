package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 发货状态枚举
 */
@Getter
@AllArgsConstructor
public enum DeliveryStatus {
    PENDING("待发货"),
    SHIPPED("已发货"),
    RECEIVED("已签收");

    private final String description;
}
