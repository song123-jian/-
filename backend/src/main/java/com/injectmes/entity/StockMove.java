package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 库存流水表
 */
@Data
@TableName("stock_move")
public class StockMove {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String moveNo;
    private Long productId;
    private Long warehouseId;
    private Long locationId;
    private Long batchId;
    private Long toWarehouseId;
    private Long toLocationId;
    private Long toBatchId;
    private String moveType;
    private String moveReason;
    private Integer qty;
    private Long relatedOrderId;
    private String relatedOrderType;
    private Long operatorId;
    private LocalDateTime operateTime;
    private String remark;
    private LocalDateTime createdAt;
}
