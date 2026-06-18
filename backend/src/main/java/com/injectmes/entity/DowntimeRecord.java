package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 停机记录表
 */
@Data
@TableName("downtime_record")
public class DowntimeRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long prodOrderId;
    private Long machineId;
    private String reason;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer durationMinutes;
    private Long operatorId;
    private String remark;
    private LocalDateTime createdAt;
}
