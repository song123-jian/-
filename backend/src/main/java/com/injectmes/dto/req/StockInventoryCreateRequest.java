package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建盘点请求
 */
@Data
public class StockInventoryCreateRequest {

    /** 仓库ID */
    @NotNull(message = "仓库不能为空")
    private Long warehouseId;

    /** 盘点类型 */
    @Size(max = 20, message = "盘点类型长度不能超过20")
    private String inventoryType;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;

    /** 创建人ID（可选，默认取当前登录用户） */
    private Long operatorId;
}
