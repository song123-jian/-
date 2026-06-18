package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

/**
 * 采购入库请求
 */
@Data
public class StockInPurchaseRequest {

    /** 仓库ID */
    @NotNull(message = "仓库不能为空")
    private Long warehouseId;

    /** 库位ID */
    private Long locationId;

    /** 供应商ID */
    @NotNull(message = "供应商不能为空")
    private Long supplierId;

    /** 入库明细 */
    @NotNull(message = "入库明细不能为空")
    @Valid
    private List<PurchaseItemDTO> items;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
