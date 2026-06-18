package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

/**
 * 生产领料出库请求
 */
@Data
public class StockOutPickingRequest {

    /** 仓库ID */
    @NotNull(message = "仓库不能为空")
    private Long warehouseId;

    /** 生产工单ID */
    @NotNull(message = "生产工单不能为空")
    private Long prodOrderId;

    /** 领料明细 */
    @NotNull(message = "领料明细不能为空")
    @Valid
    private List<PickingItemDTO> items;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
