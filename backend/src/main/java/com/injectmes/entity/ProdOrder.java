package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 生产工单表
 */
@Data
@TableName("prod_order")
public class ProdOrder {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String orderNo;
    private Long saleOrderId;
    private Long saleOrderItemId;
    private Long productId;
    private Long machineId;
    private Long moldId;
    private Integer planQty;
    private Integer completedQty;
    private Integer qualifiedQty;
    private Integer badQty;
    private BigDecimal rawMaterialQty;
    private LocalDateTime planStart;
    private LocalDateTime planEnd;
    private LocalDateTime actualStart;
    private LocalDateTime actualEnd;
    private String status;
    private Integer priority;
    private String remark;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
