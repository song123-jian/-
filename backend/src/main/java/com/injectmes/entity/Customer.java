package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户表
 */
@Data
@TableName("customer")
public class Customer {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String shortName;
    private String contact;
    private String phone;
    private String address;
    private String taxNo;
    private String invoiceTitle;
    private String creditLevel;
    private Integer paymentDays;
    private Long salesUserId;
    private Integer status;
    private LocalDateTime createdAt;
}
