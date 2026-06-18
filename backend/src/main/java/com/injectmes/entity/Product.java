package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 产品/物料表
 */
@Data
@TableName("product")
public class Product {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String spec;
    private String type;
    private String unit;
    private BigDecimal piecePrice;
    private Integer cavityYield;
    private Integer cycleTimeSec;
    private Integer safeStock;
    private BigDecimal weightG;
    private Long rawMaterialId;
    private BigDecimal rawMaterialUsage;
    private String color;
    private Long customerId;
    private String imageUrl;
    private Integer status;
    private LocalDateTime createdAt;
}
