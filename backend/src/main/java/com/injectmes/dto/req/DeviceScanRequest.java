package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 扫码请求
 */
@Data
public class DeviceScanRequest {

    @NotBlank(message = "扫码内容不能为空")
    @Size(max = 200, message = "扫码内容长度不能超过200")
    private String code;

    @Size(max = 20, message = "类型长度不能超过20")
    private String codeType;
}
