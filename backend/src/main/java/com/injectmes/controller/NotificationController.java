package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.NotificationResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.security.LoginUserDetails;
import com.injectmes.service.NotificationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
    public R<PageResponse<NotificationResponse>> list(PageRequest request,
                                                     @RequestParam(name = "isRead", required = false) Integer isRead,
                                                     @AuthenticationPrincipal LoginUserDetails loginUser) {
        Long userId = loginUser != null ? loginUser.getUserId() : getCurrentUserId();
        if (userId == null) {
            return R.fail(401, "未登录");
        }
        return notificationService.list(userId, request, isRead);
    }

    /**
     * 未读数量
     */
    @GetMapping("/unread-count")
    public R<Long> unreadCount(@AuthenticationPrincipal LoginUserDetails loginUser) {
        Long userId = loginUser != null ? loginUser.getUserId() : getCurrentUserId();
        if (userId == null) {
            return R.fail(401, "未登录");
        }
        return R.ok(notificationService.countUnread(userId));
    }

    /**
     * 标记已读
     */
    @PutMapping("/{id}/read")
    public R<Void> markRead(@PathVariable(name = "id") Long id,
                            @AuthenticationPrincipal LoginUserDetails loginUser) {
        Long userId = loginUser != null ? loginUser.getUserId() : getCurrentUserId();
        if (userId == null) {
            return R.fail(401, "未登录");
        }
        return notificationService.markRead(id, userId);
    }

    /**
     * 标记已读（兼容移动端 POST）
     */
    @PostMapping("/read/{id}")
    public R<Void> markReadAlias(@PathVariable(name = "id") Long id,
                                 @AuthenticationPrincipal LoginUserDetails loginUser) {
        return markRead(id, loginUser);
    }

    /**
     * 全部标记已读
     */
    @PostMapping("/read-all")
    public R<Void> markAllRead(@AuthenticationPrincipal LoginUserDetails loginUser) {
        Long userId = loginUser != null ? loginUser.getUserId() : getCurrentUserId();
        if (userId == null) {
            return R.fail(401, "未登录");
        }
        return notificationService.markAllRead(userId);
    }

    /**
     * 删除通知
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable(name = "id") Long id,
                          @AuthenticationPrincipal LoginUserDetails loginUser) {
        Long userId = loginUser != null ? loginUser.getUserId() : getCurrentUserId();
        if (userId == null) {
            return R.fail(401, "未登录");
        }
        return notificationService.delete(id, userId);
    }

    /**
     * 获取当前登录用户ID
     */
    private Long getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUserDetails userDetails) {
            return userDetails.getUserId();
        }
        return null;
    }
}
