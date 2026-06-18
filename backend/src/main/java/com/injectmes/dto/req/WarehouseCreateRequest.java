package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建仓库请求
 */
@Data
public class WarehouseCreateRequest {

    /** 仓库编码 */
    @NotBlank(message = "仓库编码不能为空")
    @Size(max = 50, message = "仓库编码长度不能超过50")
    private String code;

    /** 仓库名称 */
    @NotBlank(message = "仓库名称不能为空")
    @Size(max = 100, message = "仓库名称长度不能超过100")
    private String name;

    /** 仓库类型 */
    @Size(max = 20, message = "仓库类型长度不能超过20")
    private String type;

    /** 地址 */
    @Size(max = 300, message = "地址长度不能超过300")
    private String address;

    /** 管理员ID */
    private Long managerId;
}
