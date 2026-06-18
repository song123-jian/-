package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 班次枚举
 */
@Getter
@AllArgsConstructor
public enum ShiftType {
    DAY("白班"),
    NIGHT("夜班");

    private final String description;
}
