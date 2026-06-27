package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 消息推送测试请求
 */
@Data
public class PushTestRequest {

    @NotBlank(message = "标题不能为空")
    @Size(max = 100, message = "标题长度不能超过100")
    private String title;

    @NotBlank(message = "内容不能为空")
    @Size(max = 1000, message = "内容长度不能超过1000")
    private String content;

    @Size(max = 20, message = "类型长度不能超过20")
    private String type;
}
