package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 调拨单主表
 */
@Data
@TableName("stock_transfer")
public class StockTransfer {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String transferNo;
    private Long fromWarehouseId;
    private Long toWarehouseId;
    private String status;
    private Long operatorId;
    private LocalDateTime receiveTime;
    private String remark;
    private LocalDateTime createdAt;
}
