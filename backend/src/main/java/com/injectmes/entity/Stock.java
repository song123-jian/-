package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 库存表
 */
@Data
@TableName("stock")
public class Stock {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long productId;
    private Long warehouseId;
    private Long locationId;
    private Long batchId;
    private Integer qty;
    private Integer lockedQty;
    private LocalDateTime updatedAt;
}
