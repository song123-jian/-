package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.UserCreateRequest;
import com.injectmes.dto.req.UserUpdateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.UserResponse;
import com.injectmes.entity.SysUser;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 用户服务
 */
@Service
public class UserService {

    @Autowired
    private SysUserMapper userMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    /**
     * 分页查询用户列表
     * 支持keyword模糊搜索username/realName/phone
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<UserResponse>> list(PageRequest request) {
        Page<SysUser> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        // 只查询未删除的用户（status != 0）
        wrapper.ne(SysUser::getStatus, 0);

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(SysUser::getUsername, keyword)
                    .or().like(SysUser::getRealName, keyword)
                    .or().like(SysUser::getPhone, keyword)
            );
        }
        if (request.getStatus() != null && !request.getStatus().trim().isEmpty()) {
            wrapper.eq(SysUser::getStatus, Integer.valueOf(request.getStatus().trim()));
        }

        // 按创建时间降序
        wrapper.orderByDesc(SysUser::getCreatedAt);

        Page<SysUser> result = userMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<UserResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<UserResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询用户
     *
     * @param id 用户ID
     * @return 用户响应
     */
    public R<UserResponse> getById(Long id) {
        SysUser user = userMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException("用户已被删除");
        }
        return R.ok(convertToResponse(user));
    }

    /**
     * 创建用户
     * 密码BCrypt加密
     *
     * @param request 创建用户请求
     * @return 用户响应
     */
    @Transactional
    public R<UserResponse> create(UserCreateRequest request) {
        // 检查用户名是否已存在
        Long count = userMapper.selectCount(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, request.getUsername())
        );
        if (count > 0) {
            throw new BusinessException("用户名已存在");
        }

        SysUser user = new SysUser();
        user.setUsername(request.getUsername());
        user.setRealName(request.getRealName());
        user.setPhone(request.getPhone());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setRole(request.getRole());
        user.setStatus(1);
        user.setLoginFailCount(0);
        user.setCreatedAt(LocalDateTime.now());
        user.setUpdatedAt(LocalDateTime.now());

        userMapper.insert(user);

        return R.ok("创建成功", convertToResponse(user));
    }

    /**
     * 更新用户
     *
     * @param id      用户ID
     * @param request 更新用户请求
     * @return 用户响应
     */
    @Transactional
    public R<UserResponse> update(Long id, UserUpdateRequest request) {
        SysUser user = userMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }

        // 更新非空字段
        if (request.getRealName() != null) {
            user.setRealName(request.getRealName());
        }
        if (request.getPhone() != null) {
            user.setPhone(request.getPhone());
        }
        if (request.getRole() != null) {
            user.setRole(request.getRole());
        }
        if (request.getStatus() != null) {
            user.setStatus(Integer.valueOf(request.getStatus()));
        }
        user.setUpdatedAt(LocalDateTime.now());

        userMapper.updateById(user);

        return R.ok("更新成功", convertToResponse(user));
    }

    /**
     * 删除用户（逻辑删除，设置status=0）
     *
     * @param id 用户ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> delete(Long id) {
        SysUser user = userMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }

        // 逻辑删除
        user.setStatus(0);
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.updateById(user);

        return R.ok("删除成功", null);
    }

    /**
     * 重置密码
     *
     * @param id          用户ID
     * @param newPassword 新密码
     * @return 操作结果
     */
    @Transactional
    public R<Void> resetPassword(Long id, String newPassword) {
        SysUser user = userMapper.selectById(id);
        if (user == null) {
            throw new BusinessException("用户不存在");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setLoginFailCount(0);
        user.setLockUntil(null);
        user.setUpdatedAt(LocalDateTime.now());
        userMapper.updateById(user);

        return R.ok("密码重置成功", null);
    }

    /**
     * 实体转响应DTO
     */
    private UserResponse convertToResponse(SysUser user) {
        UserResponse response = new UserResponse();
        BeanUtils.copyProperties(user, response);
        // status字段类型转换：Integer -> String
        if (user.getStatus() != null) {
            response.setStatus(String.valueOf(user.getStatus()));
        }
        return response;
    }
}
