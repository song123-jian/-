package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 停机记录响应
 */
@Data
public class DowntimeRecordResponse {
    private Long id;
    private Long prodOrderId;
    private String orderNo;
    private Long machineId;
    private String machineName;
    private String reason;
    private String reasonLabel;
    private String downtimeType;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer durationMinutes;
    private Long operatorId;
    private String operatorName;
    private String remark;
    private LocalDateTime createdAt;
}
