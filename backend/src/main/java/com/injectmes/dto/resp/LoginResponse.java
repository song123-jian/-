package com.injectmes.dto.resp;

/**
 * 登录响应
 */
public class LoginResponse {

    /** 用户ID */
    private Long userId;

    /** 令牌 */
    private String token;

    /** 刷新令牌 */
    private String refreshToken;

    /** 用户名 */
    private String username;

    /** 用户名别名，兼容前端字段 */
    private String userName;

    /** 真实姓名 */
    private String realName;

    /** 手机号 */
    private String phone;

    /** 角色 */
    private String role;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public String getRealName() {
        return realName;
    }

    public void setRealName(String realName) {
        this.realName = realName;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }
}
