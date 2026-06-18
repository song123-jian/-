package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

/**
 * 盘点录入请求
 */
@Data
public class StockInventoryCountRequest {

    /** 盘点明细 */
    @NotNull(message = "盘点明细不能为空")
    @Valid
    private List<InventoryCountItemDTO> items;
}
