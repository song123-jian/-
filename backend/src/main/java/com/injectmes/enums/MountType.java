package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 模具上下模类型枚举
 */
@Getter
@AllArgsConstructor
public enum MountType {
    MOUNT("上模"),
    DISMOUNT("下模");

    private final String description;
}
