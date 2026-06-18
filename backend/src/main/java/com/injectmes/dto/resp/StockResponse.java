package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 库存响应
 */
@Data
public class StockResponse {

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

    /** 数量 */
    private BigDecimal qty;

    /** 锁定数量 */
    private BigDecimal lockedQty;

    /** 可用数量（qty - lockedQty） */
    private BigDecimal availableQty;
}
