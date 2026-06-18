package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.NotificationResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

/**
 * 通知预警控制器
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    /**
     * 我的消息列表（分页）
     */
    @GetMapping
    public R<PageResponse<NotificationResponse>> list(PageRequest request) {
        Long userId = getCurrentUserId();
        return notificationService.list(userId, request);
    }

    /**
     * 标记已读
     */
    @PutMapping("/{id}/read")
    public R<Void> markRead(@PathVariable Long id) {
        return notificationService.markRead(id);
    }

    /**
     * 获取当前登录用户ID
     */
    private Long getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof org.springframework.security.core.userdetails.UserDetails) {
            // 从认证信息中获取用户名，再查询用户ID
            String username = ((org.springframework.security.core.userdetails.UserDetails) authentication.getPrincipal()).getUsername();
            return null; // 简化处理，实际应从UserDetails中获取userId
        }
        return null;
    }
}
