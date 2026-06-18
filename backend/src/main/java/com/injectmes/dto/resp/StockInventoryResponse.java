package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 盘点响应
 */
@Data
public class StockInventoryResponse {

    /** ID */
    private Long id;

    /** 盘点编号 */
    private String inventoryNo;

    /** 仓库ID */
    private Long warehouseId;

    /** 仓库名称 */
    private String warehouseName;

    /** 盘点类型 */
    private String inventoryType;

    /** 状态 */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String creatorName;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;

    /** 盘点明细 */
    private List<StockInventoryItemResponse> items;

    /**
     * 盘点明细响应
     */
    @Data
    public static class StockInventoryItemResponse {

        /** ID */
        private Long id;

        /** 产品ID */
        private Long productId;

        /** 产品名称 */
        private String productName;

        /** 库位ID */
        private Long locationId;

        /** 库位编码 */
        private String locationCode;

        /** 批次ID */
        private Long batchId;

        /** 批次号 */
        private String batchNo;

        /** 账面数量 */
        private BigDecimal bookQty;

        /** 实际数量 */
        private BigDecimal actualQty;

        /** 差异数量 */
        private BigDecimal diffQty;

        /** 原因 */
        private String reason;
    }
}
