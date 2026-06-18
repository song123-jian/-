package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 库存移动原因枚举
 */
@Getter
@AllArgsConstructor
public enum MoveReason {
    PURCHASE("采购入库"),
    PICKING("领料出库"),
    PRODUCE_IN("生产入库"),
    SALE_OUT("销售出库"),
    RETURN("退货"),
    INVENTORY_ADJ("盘点调整"),
    TRANSFER("调拨"),
    DEFECT("不良品转储");

    private final String description;
}
