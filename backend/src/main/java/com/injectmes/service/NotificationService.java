package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.NotificationResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.Notification;
import com.injectmes.entity.SysUser;
import com.injectmes.mapper.NotificationMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 通知预警服务
 */
@Service
public class NotificationService {

    @Autowired
    private NotificationMapper notificationMapper;
    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 获取我的消息列表（分页）
     *
     * @param userId  当前用户ID
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<NotificationResponse>> list(Long userId, PageRequest request, Integer isRead) {
        Page<Notification> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Notification> wrapper = new LambdaQueryWrapper<>();
        // 按用户ID筛选
        if (userId != null) {
            wrapper.eq(Notification::getUserId, userId);
        }
        if (isRead != null) {
            wrapper.eq(Notification::getIsRead, isRead);
        }
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w.like(Notification::getTitle, keyword)
                    .or()
                    .like(Notification::getContent, keyword));
        }
        // 按创建时间降序
        wrapper.orderByDesc(Notification::getCreatedAt);

        Page<Notification> result = notificationMapper.selectPage(page, wrapper);

        List<NotificationResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<NotificationResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 标记已读
     *
     * @param id 通知ID
     */
    @Transactional
    public R<Void> markRead(Long id, Long userId) {
        Notification notification = notificationMapper.selectById(id);
        if (notification == null) {
            return R.fail("通知不存在");
        }
        if (userId != null && !userId.equals(notification.getUserId())) {
            return R.fail(403, "无权操作该通知");
        }
        if (notification.getIsRead() != null && notification.getIsRead() == 1) {
            return R.ok();
        }
        notification.setIsRead(1);
        notificationMapper.updateById(notification);
        return R.ok();
    }

    /**
     * 全部标记已读
     */
    @Transactional
    public R<Void> markAllRead(Long userId) {
        if (userId == null) {
            return R.fail(401, "未登录");
        }
        List<Notification> notifications = notificationMapper.selectList(
                new LambdaQueryWrapper<Notification>()
                        .eq(Notification::getUserId, userId)
                        .eq(Notification::getIsRead, 0)
        );
        for (Notification notification : notifications) {
            notification.setIsRead(1);
            notificationMapper.updateById(notification);
        }
        return R.ok();
    }

    /**
     * 删除通知
     */
    @Transactional
    public R<Void> delete(Long id, Long userId) {
        if (id == null) {
            return R.fail("通知不存在");
        }
        Notification notification = notificationMapper.selectById(id);
        if (notification == null) {
            return R.fail("通知不存在");
        }
        if (userId != null && !userId.equals(notification.getUserId())) {
            return R.fail(403, "无权操作该通知");
        }
        notificationMapper.deleteById(id);
        return R.ok();
    }

    /**
     * 未读消息数量
     */
    public Long countUnread(Long userId) {
        if (userId == null) {
            return 0L;
        }
        Long count = notificationMapper.selectCount(
                new LambdaQueryWrapper<Notification>()
                        .eq(Notification::getUserId, userId)
                        .eq(Notification::getIsRead, 0)
        );
        return count != null ? count : 0L;
    }

    /**
     * 发送通知（内部方法）
     *
     * @param userId  接收用户ID
     * @param title   通知标题
     * @param content 通知内容
     * @param type    通知类型（WARNING/INFO/ERROR）
     */
    @Transactional
    public void sendNotification(Long userId, String title, String content, String type) {
        Notification notification = new Notification();
        notification.setUserId(userId);
        notification.setTitle(title);
        notification.setContent(content);
        notification.setType(type);
        notification.setIsRead(0);
        notification.setCreatedAt(LocalDateTime.now());
        notificationMapper.insert(notification);
    }

    /**
     * 广播通知（所有用户）
     *
     * @param title   通知标题
     * @param content 通知内容
     * @param type    通知类型（WARNING/INFO/ERROR）
     */
    @Transactional
    public void broadcastNotification(String title, String content, String type) {
        // 查询所有启用状态的用户
        LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<>();
        userWrapper.eq(SysUser::getStatus, 1);
        List<SysUser> users = sysUserMapper.selectList(userWrapper);

        for (SysUser user : users) {
            sendNotification(user.getId(), title, content, type);
        }
    }

    /**
     * 实体转响应DTO
     */
    private NotificationResponse convertToResponse(Notification notification) {
        NotificationResponse response = new NotificationResponse();
        response.setId(notification.getId());
        response.setTitle(notification.getTitle());
        response.setContent(notification.getContent());
        response.setType(notification.getType());
        response.setIsRead(notification.getIsRead() != null && notification.getIsRead() == 1);
        response.setCreatedAt(notification.getCreatedAt());
        return response;
    }
}
