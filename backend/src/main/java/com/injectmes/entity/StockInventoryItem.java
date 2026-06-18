package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 盘点单明细表
 */
@Data
@TableName("stock_inventory_item")
public class StockInventoryItem {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long inventoryId;
    private Long productId;
    private Long locationId;
    private Long batchId;
    private Integer bookQty;
    private Integer actualQty;
    private Integer diffQty;
    private BigDecimal diffAmount;
    private String reason;
}
