package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 通知响应
 */
@Data
public class NotificationResponse {

    /** ID */
    private Long id;

    /** 标题 */
    private String title;

    /** 内容 */
    private String content;

    /** 类型 */
    private String type;

    /** 是否已读 */
    private Boolean isRead;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
