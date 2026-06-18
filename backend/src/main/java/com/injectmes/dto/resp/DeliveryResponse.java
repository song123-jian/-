package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 发货响应
 */
@Data
public class DeliveryResponse {

    /** ID */
    private Long id;

    /** 发货编号 */
    private String deliveryNo;

    /** 销售订单ID */
    private Long saleOrderId;

    /** 订单编号 */
    private String orderNo;

    /** 客户ID */
    private Long customerId;

    /** 客户名称 */
    private String customerName;

    /** 发货日期 */
    private LocalDate deliveryDate;

    /** 物流公司 */
    private String logisticsCompany;

    /** 物流单号 */
    private String trackingNo;

    /** 状态 */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String creatorName;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;

    /** 发货明细 */
    private List<DeliveryItemResponse> items;

    /**
     * 发货明细响应
     */
    @Data
    public static class DeliveryItemResponse {

        /** ID */
        private Long id;

        /** 销售订单明细ID */
        private Long saleOrderItemId;

        /** 产品ID */
        private Long productId;

        /** 产品名称 */
        private String productName;

        /** 数量 */
        private Integer qty;
    }
}
