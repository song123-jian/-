package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 收款记录响应
 */
@Data
public class PaymentResponse {

    /** ID */
    private Long id;

    /** 客户ID */
    private Long customerId;

    /** 客户名称 */
    private String customerName;

    /** 销售订单ID */
    private Long saleOrderId;

    /** 订单编号 */
    private String orderNo;

    /** 收款金额 */
    private BigDecimal payAmount;

    /** 收款日期 */
    private LocalDate payDate;

    /** 收款方式 */
    private String payMethod;

    /** 发票号 */
    private String invoiceNo;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String creatorName;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
