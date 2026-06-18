package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 停机原因枚举
 */
@Getter
@AllArgsConstructor
public enum DowntimeReason {
    MOLD_CHANGE("换模"),
    MATERIAL_SHORTAGE("缺料"),
    QUALITY_ISSUE("品质问题"),
    EQUIPMENT_FAULT("设备故障"),
    BREAK("休息"),
    OTHER("其他");

    private final String description;
}
