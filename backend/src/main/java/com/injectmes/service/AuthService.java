package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
import com.injectmes.config.LocalTokenStore;
import com.injectmes.dto.req.LoginRequest;
import com.injectmes.dto.resp.LoginResponse;
import com.injectmes.entity.SysUser;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.SysUserMapper;
import com.injectmes.security.JwtUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * 认证服务
 */
@Service
public class AuthService {

    /** 登录失败最大次数 */
    private static final int MAX_FAIL_COUNT = 5;

    /** 锁定时长（分钟） */
    private static final int LOCK_DURATION_MINUTES = 15;

    /** Token有效期（小时） */
    private static final int TOKEN_EXPIRE_HOURS = 2;

    /** RefreshToken有效期（天） */
    private static final int REFRESH_TOKEN_EXPIRE_DAYS = 7;

    /** Token存储key前缀 */
    private static final String TOKEN_PREFIX = "inject:erp:";

    @Autowired
    private SysUserMapper userMapper;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private LocalTokenStore tokenStore;

    /**
     * 用户登录
     */
    @Transactional
    public R<LoginResponse> login(LoginRequest request) {
        SysUser user = userMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, request.getUsername())
        );
        if (user == null) {
            throw new BusinessException(401, "用户名或密码错误");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(403, "账号已被禁用");
        }

        if (user.getLockUntil() != null && user.getLockUntil().isAfter(LocalDateTime.now())) {
            throw new BusinessException(403, "账号已被锁定，请" + LOCK_DURATION_MINUTES + "分钟后再试");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            int failCount = (user.getLoginFailCount() == null ? 0 : user.getLoginFailCount()) + 1;
            user.setLoginFailCount(failCount);

            if (failCount >= MAX_FAIL_COUNT) {
                user.setLockUntil(LocalDateTime.now().plusMinutes(LOCK_DURATION_MINUTES));
            }
            userMapper.updateById(user);
            throw new BusinessException(401, "用户名或密码错误");
        }

        user.setLoginFailCount(0);
        user.setLockUntil(null);
        user.setLastLoginAt(LocalDateTime.now());
        userMapper.updateById(user);

        String token = jwtUtils.generateToken(user.getUsername(), Map.of("userId", user.getId(), "role", user.getRole()));
        String refreshToken = UUID.randomUUID().toString().replace("-", "");

        String tokenKey = TOKEN_PREFIX + "refresh:" + refreshToken;
        tokenStore.set(tokenKey, user.getId().toString(), REFRESH_TOKEN_EXPIRE_DAYS, TimeUnit.DAYS);

        LoginResponse response = new LoginResponse();
        response.setToken(token);
        response.setRefreshToken(refreshToken);
        response.setUsername(user.getUsername());
        response.setRealName(user.getRealName());
        response.setRole(user.getRole());

        return R.ok("登录成功", response);
    }

    /**
     * 刷新Token
     */
    public R<LoginResponse> refresh(String refreshToken) {
        String tokenKey = TOKEN_PREFIX + "refresh:" + refreshToken;
        String userIdStr = tokenStore.get(tokenKey);
        if (userIdStr == null) {
            throw new BusinessException(401, "刷新令牌已过期，请重新登录");
        }

        Long userId = Long.parseLong(userIdStr);
        SysUser user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException(401, "用户不存在");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(403, "账号已被禁用");
        }

        String newToken = jwtUtils.generateToken(user.getUsername(), Map.of("userId", user.getId(), "role", user.getRole()));
        String newRefreshToken = UUID.randomUUID().toString().replace("-", "");

        tokenStore.delete(tokenKey);
        String newTokenKey = TOKEN_PREFIX + "refresh:" + newRefreshToken;
        tokenStore.set(newTokenKey, user.getId().toString(), REFRESH_TOKEN_EXPIRE_DAYS, TimeUnit.DAYS);

        LoginResponse response = new LoginResponse();
        response.setToken(newToken);
        response.setRefreshToken(newRefreshToken);
        response.setUsername(user.getUsername());
        response.setRealName(user.getRealName());
        response.setRole(user.getRole());

        return R.ok("刷新成功", response);
    }

    /**
     * 登出
     */
    public R<Void> logout(String token) {
        try {
            String username = jwtUtils.getUsernameFromToken(token);

            var keys = tokenStore.keys(TOKEN_PREFIX + "refresh:*");
            if (keys != null && !keys.isEmpty()) {
                for (String key : keys) {
                    String userIdStr = tokenStore.get(key);
                    if (userIdStr != null) {
                        SysUser user = userMapper.selectById(Long.parseLong(userIdStr));
                        if (user != null && user.getUsername().equals(username)) {
                            tokenStore.delete(key);
                        }
                    }
                }
            }
        } catch (Exception e) {
            // token解析失败也允许登出
        }
        return R.ok("登出成功", null);
    }
}
