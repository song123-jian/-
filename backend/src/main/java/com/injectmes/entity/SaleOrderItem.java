package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 销售订单明细表
 */
@Data
@TableName("sale_order_item")
public class SaleOrderItem {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long saleOrderId;
    private Long productId;
    private Integer qty;
    private BigDecimal unitPrice;
    private BigDecimal amount;
    private Integer deliveredQty;
    private Integer producedQty;
    private String remark;
}
