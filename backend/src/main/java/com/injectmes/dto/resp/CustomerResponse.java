package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户响应
 */
@Data
public class CustomerResponse {

    /** ID */
    private Long id;

    /** 客户编码 */
    private String code;

    /** 客户名称 */
    private String name;

    /** 简称 */
    private String shortName;

    /** 联系人 */
    private String contact;

    /** 电话 */
    private String phone;

    /** 地址 */
    private String address;

    /** 税号 */
    private String taxNo;

    /** 开票抬头 */
    private String invoiceTitle;

    /** 信用等级 */
    private String creditLevel;

    /** 账期（天） */
    private Integer paymentDays;

    /** 销售员ID */
    private Long salesUserId;

    /** 状态 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;
}
