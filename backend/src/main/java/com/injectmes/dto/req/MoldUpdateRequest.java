package com.injectmes.dto.req;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 更新模具请求
 */
@Data
public class MoldUpdateRequest {

    /** 模具名称 */
    @Size(max = 100, message = "模具名称长度不能超过100")
    private String name;

    /** 关联产品ID */
    private Long productId;

    /** 穴数 */
    private Integer cavities;

    /** 寿命（模次） */
    private Integer lifetime;

    /** 保养周期（模次） */
    private Integer maintenanceCycle;

    /** 状态 */
    @Size(max = 20, message = "状态长度不能超过20")
    private String status;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
