package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 发货单表
 */
@Data
@TableName("delivery_order")
public class DeliveryOrder {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String deliveryNo;
    private Long saleOrderId;
    private Long customerId;
    private LocalDate deliveryDate;
    private Integer totalQty;
    private String logisticsCompany;
    private String trackingNo;
    private String status;
    private Long operatorId;
    private String remark;
    private LocalDateTime createdAt;
}
