package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建模具请求
 */
@Data
public class MoldCreateRequest {

    /** 模具编码 */
    @NotBlank(message = "模具编码不能为空")
    @Size(max = 50, message = "模具编码长度不能超过50")
    private String code;

    /** 模具名称 */
    @NotBlank(message = "模具名称不能为空")
    @Size(max = 100, message = "模具名称长度不能超过100")
    private String name;

    /** 关联产品ID */
    @NotNull(message = "关联产品不能为空")
    private Long productId;

    /** 穴数 */
    private Integer cavities;

    /** 寿命（模次） */
    private Integer lifetime;

    /** 保养周期（模次） */
    private Integer maintenanceCycle;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
