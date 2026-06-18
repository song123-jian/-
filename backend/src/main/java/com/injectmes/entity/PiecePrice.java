package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 计件单价表
 */
@Data
@TableName("piece_price")
public class PiecePrice {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long productId;
    private String processName;
    private BigDecimal price;
    private LocalDate effectiveDate;
    private LocalDate expireDate;
    private Long createdBy;
    private LocalDateTime createdAt;
}
