package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 库存移动类型枚举
 */
@Getter
@AllArgsConstructor
public enum MoveType {
    IN("入库"),
    OUT("出库"),
    TRANSFER("调拨");

    private final String description;
}
