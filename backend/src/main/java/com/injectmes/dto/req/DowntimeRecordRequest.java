package com.injectmes.dto.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 停机记录请求
 */
@Data
public class DowntimeRecordRequest {

    /** 机台ID */
    @NotNull(message = "机台不能为空")
    private Long machineId;

    /** 生产工单ID */
    private Long prodOrderId;

    /** 停机原因 */
    @NotBlank(message = "停机原因不能为空")
    @Size(max = 50, message = "停机原因长度不能超过50")
    private String reason;

    /** 开始时间 */
    @NotNull(message = "停机开始时间不能为空")
    private LocalDateTime startTime;

    /** 结束时间 */
    private LocalDateTime endTime;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
