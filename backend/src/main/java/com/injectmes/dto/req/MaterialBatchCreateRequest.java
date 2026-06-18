package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

/**
 * 创建物料批次请求
 */
@Data
public class MaterialBatchCreateRequest {

    /** 批次号 */
    @NotBlank(message = "批次号不能为空")
    @Size(max = 50, message = "批次号长度不能超过50")
    private String batchNo;

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 仓库ID */
    @NotNull(message = "仓库不能为空")
    private Long warehouseId;

    /** 供应商ID */
    private Long supplierId;

    /** 生产日期 */
    private LocalDate productionDate;

    /** 有效期 */
    private LocalDate expiryDate;

    /** 初始数量 */
    @NotNull(message = "初始数量不能为空")
    private java.math.BigDecimal initialQty;
}
