package com.injectmes.dto.req;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 更新客户请求
 */
@Data
public class CustomerUpdateRequest {

    /** 客户名称 */
    @Size(max = 100, message = "客户名称长度不能超过100")
    private String name;

    /** 简称 */
    @Size(max = 50, message = "简称长度不能超过50")
    private String shortName;

    /** 联系人 */
    @Size(max = 50, message = "联系人长度不能超过50")
    private String contact;

    /** 电话 */
    @Size(max = 30, message = "电话长度不能超过30")
    private String phone;

    /** 地址 */
    @Size(max = 300, message = "地址长度不能超过300")
    private String address;

    /** 税号 */
    @Size(max = 50, message = "税号长度不能超过50")
    private String taxNo;

    /** 开票抬头 */
    @Size(max = 200, message = "开票抬头长度不能超过200")
    private String invoiceTitle;

    /** 信用等级 */
    @Size(max = 20, message = "信用等级长度不能超过20")
    private String creditLevel;

    /** 账期（天） */
    private Integer paymentDays;

    /** 销售员ID */
    private Long salesUserId;

    /** 状态 */
    @Size(max = 20, message = "状态长度不能超过20")
    private String status;
}
