package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 通知消息表
 */
@Data
@TableName("notification")
public class Notification {
    @TableId(type = IdType.AUTO)
    private Long id;
    /** 接收用户ID */
    private Long userId;
    /** 通知标题 */
    private String title;
    /** 通知内容 */
    private String content;
    /** 通知类型（WARNING/INFO/ERROR） */
    private String type;
    /** 是否已读 0未读 1已读 */
    private Integer isRead;
    /** 创建时间 */
    private LocalDateTime createdAt;
}
