package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 销售订单响应
 */
@Data
public class SaleOrderResponse {

    /** ID */
    private Long id;

    /** 订单编号 */
    private String orderNo;

    /** 客户ID */
    private Long customerId;

    /** 客户名称 */
    private String customerName;

    /** 订单日期 */
    private LocalDate orderDate;

    /** 交货日期 */
    private LocalDate deliveryDate;

    /** 订单金额 */
    private BigDecimal totalAmount;

    /** 状态 */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;

    /** 订单明细 */
    private List<SaleOrderItemResponse> items;

    /**
     * 销售订单明细响应
     */
    @Data
    public static class SaleOrderItemResponse {

        /** ID */
        private Long id;

        /** 产品ID */
        private Long productId;

        /** 产品名称 */
        private String productName;

        /** 数量 */
        private Integer qty;

        /** 单价 */
        private BigDecimal unitPrice;

        /** 金额 */
        private BigDecimal amount;

        /** 已发货数量 */
        private Integer deliveredQty;

        /** 备注 */
        private String remark;
    }
}
