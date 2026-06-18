package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 调拨单状态枚举
 */
@Getter
@AllArgsConstructor
public enum TransferStatus {
    DRAFT("草稿"),
    SHIPPED("已发货"),
    RECEIVED("已收货"),
    CLOSED("已关闭");

    private final String description;
}
