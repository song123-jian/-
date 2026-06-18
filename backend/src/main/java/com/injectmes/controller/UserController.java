package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.UserCreateRequest;
import com.injectmes.dto.req.UserUpdateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.UserResponse;
import com.injectmes.service.UserService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 用户管理控制器
 */
@RestController
@RequestMapping("/api/users")
@Validated
public class UserController {

    @Autowired
    private UserService userService;

    /**
     * 用户列表（分页）
     */
    @GetMapping
    public R<PageResponse<UserResponse>> list(PageRequest request) {
        return userService.list(request);
    }

    /**
     * 用户详情
     */
    @GetMapping("/{id}")
    public R<UserResponse> getById(@PathVariable Long id) {
        return userService.getById(id);
    }

    /**
     * 新增用户
     */
    @PostMapping
    public R<UserResponse> create(@Valid @RequestBody UserCreateRequest request) {
        return userService.create(request);
    }

    /**
     * 编辑用户
     */
    @PutMapping("/{id}")
    public R<UserResponse> update(@PathVariable Long id, @Valid @RequestBody UserUpdateRequest request) {
        return userService.update(id, request);
    }

    /**
     * 删除用户
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        userService.delete(id);
        return R.ok();
    }

    /**
     * 重置密码
     */
    @PutMapping("/{id}/reset-password")
    public R<Void> resetPassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String newPassword = body.get("newPassword");
        userService.resetPassword(id, newPassword);
        return R.ok();
    }
}
