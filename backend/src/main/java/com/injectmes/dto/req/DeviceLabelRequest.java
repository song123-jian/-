package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 标签预览请求
 */
@Data
public class DeviceLabelRequest {

    @NotBlank(message = "目标类型不能为空")
    @Size(max = 20, message = "目标类型长度不能超过20")
    private String targetType;

    @NotNull(message = "目标ID不能为空")
    private Long targetId;
}
