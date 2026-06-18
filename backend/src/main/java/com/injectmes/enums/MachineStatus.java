package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 机台状态枚举
 */
@Getter
@AllArgsConstructor
public enum MachineStatus {
    RUNNING("运行中"),
    IDLE("空闲"),
    MAINTENANCE("维护中"),
    STOPPED("停机");

    private final String description;
}
