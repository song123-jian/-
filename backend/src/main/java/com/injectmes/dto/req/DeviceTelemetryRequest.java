package com.injectmes.dto.req;

import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备遥测请求
 */
@Data
public class DeviceTelemetryRequest {

    private Long machineId;

    @Size(max = 50, message = "机台编码长度不能超过50")
    private String machineCode;

    @Size(max = 20, message = "机台状态长度不能超过20")
    private String status;

    private Long prodOrderId;

    @Size(max = 50, message = "工单编号长度不能超过50")
    private String orderNo;

    private Long moldId;

    private Integer qty;

    private Integer badQty;

    private Integer shots;

    @Size(max = 20, message = "报工类型长度不能超过20")
    private String reportType;

    @Size(max = 20, message = "班次长度不能超过20")
    private String shift;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    @Size(max = 200, message = "来源长度不能超过200")
    private String source;

    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
