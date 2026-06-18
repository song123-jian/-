package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 生产工单排产请求
 */
@Data
public class ProdOrderScheduleRequest {

    /** 注塑机ID */
    @NotNull(message = "注塑机不能为空")
    private Long machineId;

    /** 模具ID */
    @NotNull(message = "模具不能为空")
    private Long moldId;

    /** 计划开始时间 */
    @NotNull(message = "计划开始时间不能为空")
    private LocalDateTime planStart;

    /** 计划结束时间 */
    @NotNull(message = "计划结束时间不能为空")
    private LocalDateTime planEnd;
}
