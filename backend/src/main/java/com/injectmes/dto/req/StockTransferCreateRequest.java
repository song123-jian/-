package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import lombok.Data;

import java.util.List;

/**
 * 创建调拨请求
 */
@Data
public class StockTransferCreateRequest {

    /** 源仓库ID */
    @NotNull(message = "源仓库不能为空")
    private Long fromWarehouseId;

    /** 目标仓库ID */
    @NotNull(message = "目标仓库不能为空")
    private Long toWarehouseId;

    /** 调拨明细 */
    @NotNull(message = "调拨明细不能为空")
    @Valid
    private List<TransferItemDTO> items;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
