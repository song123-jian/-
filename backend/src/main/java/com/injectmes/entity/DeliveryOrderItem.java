package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 发货单明细表
 */
@Data
@TableName("delivery_order_item")
public class DeliveryOrderItem {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deliveryOrderId;
    private Long saleOrderItemId;
    private Long productId;
    private Integer qty;
}
