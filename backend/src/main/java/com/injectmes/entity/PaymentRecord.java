package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 回款记录表
 */
@Data
@TableName("payment_record")
public class PaymentRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String paymentNo;
    private Long customerId;
    private Long saleOrderId;
    private BigDecimal payAmount;
    private LocalDate payDate;
    private String payMethod;
    private String invoiceNo;
    private String remark;
    private Long createdBy;
    private LocalDateTime createdAt;
}
