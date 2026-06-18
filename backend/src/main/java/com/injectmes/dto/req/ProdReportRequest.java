package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 生产报工请求
 */
@Data
public class ProdReportRequest {

    /** 生产工单ID */
    @NotNull(message = "生产工单不能为空")
    private Long prodOrderId;

    /** 注塑机ID */
    @NotNull(message = "注塑机不能为空")
    private Long machineId;

    /** 模具ID */
    private Long moldId;

    /** 报工类型 */
    @Size(max = 20, message = "报工类型长度不能超过20")
    private String reportType;

    /** 班次 */
    @Size(max = 20, message = "班次长度不能超过20")
    private String shift;

    /** 良品数量 */
    @NotNull(message = "良品数量不能为空")
    private Integer qty;

    /** 不良品数量 */
    private Integer badQty;

    /** 模次 */
    private Integer shots;

    /** 开始时间 */
    private LocalDateTime startTime;

    /** 结束时间 */
    private LocalDateTime endTime;
}
