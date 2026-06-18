package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 调拨单明细表
 */
@Data
@TableName("stock_transfer_item")
public class StockTransferItem {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long transferId;
    private Long productId;
    private Long fromLocationId;
    private Long toLocationId;
    private Long fromBatchId;
    private Integer qty;
    private Integer receivedQty;
    private String remark;
}
