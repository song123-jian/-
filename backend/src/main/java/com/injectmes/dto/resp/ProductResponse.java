package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 产品响应
 */
@Data
public class ProductResponse {

    /** ID */
    private Long id;

    /** 产品编码 */
    private String code;

    /** 产品名称 */
    private String name;

    /** 规格 */
    private String spec;

    /** 类型 */
    private String type;

    /** 单位 */
    private String unit;

    /** 计件单价 */
    private BigDecimal piecePrice;

    /** 穴产出 */
    private BigDecimal cavityYield;

    /** 成型周期（秒） */
    private Integer cycleTimeSec;

    /** 安全库存 */
    private Integer safeStock;

    /** 重量（克） */
    private BigDecimal weightG;

    /** 原料ID */
    private Long rawMaterialId;

    /** 原料用量（克） */
    private BigDecimal rawMaterialUsage;

    /** 颜色 */
    private String color;

    /** 客户ID */
    private Long customerId;

    /** 图片URL */
    private String imageUrl;

    /** 状态 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;
}
