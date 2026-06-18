package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 物料批次表
 */
@Data
@TableName("material_batch")
public class MaterialBatch {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String batchNo;
    private Long productId;
    private Long warehouseId;
    private Long supplierId;
    private LocalDate productionDate;
    private LocalDate expiryDate;
    private Integer initialQty;
    private Integer remainingQty;
    private String status;
    private LocalDateTime createdAt;
}
