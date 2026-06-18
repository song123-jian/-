package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 创建产品请求
 */
@Data
public class ProductCreateRequest {

    /** 产品编码 */
    @NotBlank(message = "产品编码不能为空")
    @Size(max = 50, message = "产品编码长度不能超过50")
    private String code;

    /** 产品名称 */
    @NotBlank(message = "产品名称不能为空")
    @Size(max = 100, message = "产品名称长度不能超过100")
    private String name;

    /** 规格 */
    @Size(max = 100, message = "规格长度不能超过100")
    private String spec;

    /** 类型 */
    @Size(max = 50, message = "类型长度不能超过50")
    private String type;

    /** 单位 */
    @Size(max = 20, message = "单位长度不能超过20")
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
    @Size(max = 50, message = "颜色长度不能超过50")
    private String color;

    /** 客户ID */
    private Long customerId;

    /** 图片URL */
    @Size(max = 500, message = "图片URL长度不能超过500")
    private String imageUrl;

    /** 状态 */
    @Size(max = 20, message = "状态长度不能超过20")
    private String status;
}
