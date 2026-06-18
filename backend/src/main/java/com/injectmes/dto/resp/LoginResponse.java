package com.injectmes.dto.resp;

import lombok.Data;

/**
 * 登录响应
 */
@Data
public class LoginResponse {

    /** 令牌 */
    private String token;

    /** 刷新令牌 */
    private String refreshToken;

    /** 用户名 */
    private String username;

    /** 真实姓名 */
    private String realName;

    /** 角色 */
    private String role;
}
