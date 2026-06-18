package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 物料批次响应
 */
@Data
public class MaterialBatchResponse {

    /** ID */
    private Long id;

    /** 批次号 */
    private String batchNo;

    /** 产品ID */
    private Long productId;

    /** 产品名称 */
    private String productName;

    /** 仓库ID */
    private Long warehouseId;

    /** 仓库名称 */
    private String warehouseName;

    /** 供应商ID */
    private Long supplierId;

    /** 供应商名称 */
    private String supplierName;

    /** 生产日期 */
    private LocalDate productionDate;

    /** 有效期 */
    private LocalDate expiryDate;

    /** 初始数量 */
    private BigDecimal initialQty;

    /** 当前数量 */
    private BigDecimal currentQty;

    /** 状态 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
