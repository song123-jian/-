package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 库存流水响应
 */
@Data
public class StockMoveResponse {

    /** ID */
    private Long id;

    /** 产品ID */
    private Long productId;

    /** 产品名称 */
    private String productName;

    /** 仓库ID */
    private Long warehouseId;

    /** 仓库名称 */
    private String warehouseName;

    /** 库位ID */
    private Long locationId;

    /** 库位编码 */
    private String locationCode;

    /** 批次ID */
    private Long batchId;

    /** 批次号 */
    private String batchNo;

    /** 移动类型 */
    private String moveType;

    /** 移动方向 */
    private String direction;

    /** 数量 */
    private BigDecimal qty;

    /** 关联单据ID */
    private Long relatedId;

    /** 关联单据类型 */
    private String relatedType;

    /** 备注 */
    private String remark;

    /** 操作人 */
    private String operatorName;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
