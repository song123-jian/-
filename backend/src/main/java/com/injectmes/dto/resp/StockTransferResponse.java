package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 调拨响应
 */
@Data
public class StockTransferResponse {

    /** ID */
    private Long id;

    /** 调拨编号 */
    private String transferNo;

    /** 源仓库ID */
    private Long fromWarehouseId;

    /** 源仓库名称 */
    private String fromWarehouseName;

    /** 目标仓库ID */
    private Long toWarehouseId;

    /** 目标仓库名称 */
    private String toWarehouseName;

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

    /** 调拨明细 */
    private List<StockTransferItemResponse> items;

    /**
     * 调拨明细响应
     */
    @Data
    public static class StockTransferItemResponse {

        /** ID */
        private Long id;

        /** 产品ID */
        private Long productId;

        /** 产品名称 */
        private String productName;

        /** 源库位ID */
        private Long fromLocationId;

        /** 源库位编码 */
        private String fromLocationCode;

        /** 目标库位ID */
        private Long toLocationId;

        /** 目标库位编码 */
        private String toLocationCode;

        /** 源批次ID */
        private Long fromBatchId;

        /** 源批次号 */
        private String fromBatchNo;

        /** 数量 */
        private BigDecimal qty;
    }
}
