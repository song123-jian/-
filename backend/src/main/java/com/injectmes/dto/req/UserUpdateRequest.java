package com.injectmes.dto.req;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 更新用户请求
 */
@Data
public class UserUpdateRequest {

    /** 真实姓名 */
    @Size(max = 50, message = "真实姓名长度不能超过50")
    private String realName;

    /** 手机号 */
    @Size(max = 20, message = "手机号长度不能超过20")
    private String phone;

    /** 角色 */
    @Size(max = 20, message = "角色长度不能超过20")
    private String role;

    /** 状态 */
    @Size(max = 20, message = "状态长度不能超过20")
    private String status;
}
