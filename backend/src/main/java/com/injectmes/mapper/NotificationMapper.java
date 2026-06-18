package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.Notification;
import org.apache.ibatis.annotations.Mapper;

/**
 * 通知消息Mapper
 */
@Mapper
public interface NotificationMapper extends BaseMapper<Notification> {
}
