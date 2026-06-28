package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.LoginRequest;
import com.injectmes.dto.resp.LoginResponse;
import com.injectmes.entity.SysUser;
import com.injectmes.mapper.SysUserMapper;
import com.injectmes.security.JwtUtils;
import com.injectmes.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 认证控制器
 */
@RestController
@RequestMapping("/api/auth")
@Validated
public class AuthController {

    @Autowired
    private AuthService authService;

    @Autowired
    private SysUserMapper userMapper;

    @Autowired
    private JwtUtils jwtUtils;

    /**
     * 获取当前用户信息
     */
    @GetMapping("/userinfo")
    public R<Map<String, Object>> userinfo(@RequestHeader("Authorization") String authorization) {
        String token = authorization.replace("Bearer ", "");
        String username = jwtUtils.getUsernameFromToken(token);
        SysUser user = userMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, username)
        );
        if (user == null) {
            return R.fail(401, "用户不存在");
        }
        Map<String, Object> info = Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "userName", user.getUsername(),
                "realName", user.getRealName() != null ? user.getRealName() : "",
                "phone", user.getPhone() != null ? user.getPhone() : "",
                "role", user.getRole() != null ? user.getRole() : "",
                "roles", java.util.List.of(user.getRole() != null ? user.getRole() : ""),
                "status", user.getStatus() != null ? user.getStatus() : 1
        );
        return R.ok(info);
    }

    /**
     * 鑾峰彇褰撳墠鐢ㄦ埛淇℃伅锛堝吋瀹瑰疄鍦ㄧ鍐? */
    @GetMapping("/user-info")
    public R<Map<String, Object>> userInfoAlias(@RequestHeader("Authorization") String authorization) {
        return userinfo(authorization);
    }

    /**
     * 用户登录
     */
    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /**
     * 刷新Token
     */
    @PostMapping("/refresh")
    public R<LoginResponse> refresh(@RequestBody Map<String, String> body) {
        String refreshToken = body.getOrDefault("refreshToken", body.get("token"));
        return authService.refresh(refreshToken);
    }

    /**
     * 用户登出
     */
    @PostMapping("/logout")
    public R<Void> logout(@RequestHeader("Authorization") String authorization) {
        // 去除Bearer前缀
        String token = authorization.replace("Bearer ", "");
        authService.logout(token);
        return R.ok();
    }
}
