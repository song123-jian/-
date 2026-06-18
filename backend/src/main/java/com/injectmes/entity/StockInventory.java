package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 盘点单主表
 */
@Data
@TableName("stock_inventory")
public class StockInventory {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String inventoryNo;
    private Long warehouseId;
    private String inventoryType;
    private String status;
    private Integer freezeStock;
    private Long operatorId;
    private Long approverId;
    private String remark;
    private LocalDateTime createdAt;
}
