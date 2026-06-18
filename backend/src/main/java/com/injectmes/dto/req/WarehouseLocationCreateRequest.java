package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建库位请求
 */
@Data
public class WarehouseLocationCreateRequest {

    /** 仓库ID */
    @NotNull(message = "仓库不能为空")
    private Long warehouseId;

    /** 库位编码 */
    @NotBlank(message = "库位编码不能为空")
    @Size(max = 50, message = "库位编码长度不能超过50")
    private String code;

    /** 库位名称 */
    @NotBlank(message = "库位名称不能为空")
    @Size(max = 100, message = "库位名称长度不能超过100")
    private String name;

    /** 区域 */
    @Size(max = 50, message = "区域长度不能超过50")
    private String area;

    /** 货架 */
    @Size(max = 50, message = "货架长度不能超过50")
    private String shelf;

    /** 层 */
    @Size(max = 50, message = "层长度不能超过50")
    private String layer;

    /** 位 */
    @Size(max = 50, message = "位长度不能超过50")
    private String position;
}
