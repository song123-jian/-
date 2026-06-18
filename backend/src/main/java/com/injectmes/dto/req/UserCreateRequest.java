package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 创建用户请求
 */
@Data
public class UserCreateRequest {

    /** 用户名 */
    @NotBlank(message = "用户名不能为空")
    @Size(max = 50, message = "用户名长度不能超过50")
    private String username;

    /** 真实姓名 */
    @NotBlank(message = "真实姓名不能为空")
    @Size(max = 50, message = "真实姓名长度不能超过50")
    private String realName;

    /** 手机号 */
    @Size(max = 20, message = "手机号长度不能超过20")
    private String phone;

    /** 密码 */
    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 100, message = "密码长度需在6-100之间")
    private String password;

    /** 角色 */
    @NotBlank(message = "角色不能为空")
    @Size(max = 20, message = "角色长度不能超过20")
    private String role;
}
