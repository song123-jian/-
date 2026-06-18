package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 收款请求
 */
@Data
public class PaymentRequest {

    /** 客户ID */
    @NotNull(message = "客户不能为空")
    private Long customerId;

    /** 销售订单ID */
    @NotNull(message = "销售订单不能为空")
    private Long saleOrderId;

    /** 收款金额 */
    @NotNull(message = "收款金额不能为空")
    private BigDecimal payAmount;

    /** 收款日期 */
    @NotNull(message = "收款日期不能为空")
    private LocalDate payDate;

    /** 收款方式 */
    @Size(max = 20, message = "收款方式长度不能超过20")
    private String payMethod;

    /** 发票号 */
    @Size(max = 50, message = "发票号长度不能超过50")
    private String invoiceNo;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
