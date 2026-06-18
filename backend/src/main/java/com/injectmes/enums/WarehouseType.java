package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 仓库类型枚举
 */
@Getter
@AllArgsConstructor
public enum WarehouseType {
    RAW("原料仓"),
    SEMI("半成品仓"),
    FINISH("成品仓"),
    DEFECT("不良品仓"),
    SCRAP("报废仓");

    private final String description;
}
