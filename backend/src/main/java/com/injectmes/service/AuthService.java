package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
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

/**
 * 认证服务
 */
@Service
public class AuthService {

    private static final int MAX_FAIL_COUNT = 5;
    private static final int LOCK_DURATION_MINUTES = 15;

    @Autowired
    private SysUserMapper userMapper;

    @Autowired
    private JwtUtils jwtUtils;

    @Autowired
    private PasswordEncoder passwordEncoder;

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

        LoginResponse response = new LoginResponse();
        response.setUserId(user.getId());
        response.setToken(token);
        response.setRefreshToken(token);
        response.setUsername(user.getUsername());
        response.setUserName(user.getUsername());
        response.setRealName(user.getRealName());
        response.setPhone(user.getPhone());
        response.setRole(user.getRole());

        return R.ok("登录成功", response);
    }

    /**
     * 刷新Token
     */
    public R<LoginResponse> refresh(String refreshToken) {
        if (refreshToken == null || refreshToken.trim().isEmpty()) {
            throw new BusinessException(401, "刷新令牌无效，请重新登录");
        }

        if (!jwtUtils.validateToken(refreshToken)) {
            throw new BusinessException(401, "刷新令牌已过期，请重新登录");
        }

        String username = jwtUtils.getUsernameFromToken(refreshToken);
        SysUser user = userMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username)
        );
        if (user == null) {
            throw new BusinessException(401, "用户不存在");
        }

        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(403, "账号已被禁用");
        }

        String newToken = jwtUtils.generateToken(user.getUsername(), Map.of("userId", user.getId(), "role", user.getRole()));

        LoginResponse response = new LoginResponse();
        response.setUserId(user.getId());
        response.setToken(newToken);
        response.setRefreshToken(newToken);
        response.setUsername(user.getUsername());
        response.setUserName(user.getUsername());
        response.setRealName(user.getRealName());
        response.setPhone(user.getPhone());
        response.setRole(user.getRole());

        return R.ok("刷新成功", response);
    }

    /**
     * 登出
     */
    public R<Void> logout(String token) {
        return R.ok("登出成功", null);
    }
}
