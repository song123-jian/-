package com.injectmes.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 付款方式枚举
 */
@Getter
@AllArgsConstructor
public enum PayMethod {
    CASH("现金"),
    BANK_TRANSFER("银行转账"),
    WECHAT("微信"),
    ALIPAY("支付宝"),
    ACCEPTANCE("承兑汇票");

    private final String description;
}
