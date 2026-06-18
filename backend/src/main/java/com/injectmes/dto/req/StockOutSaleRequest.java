package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

/**
 * 销售出库请求
 */
@Data
public class StockOutSaleRequest {

    /** 仓库ID */
    @NotNull(message = "仓库不能为空")
    private Long warehouseId;

    /** 销售订单ID */
    @NotNull(message = "销售订单不能为空")
    private Long saleOrderId;

    /** 出库明细 */
    @NotNull(message = "出库明细不能为空")
    @Valid
    private List<SaleOutItemDTO> items;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
