package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 生产报工响应
 */
@Data
public class ProdReportResponse {

    /** ID */
    private Long id;

    /** 生产工单ID */
    private Long prodOrderId;

    /** 工单编号 */
    private String orderNo;

    /** 注塑机ID */
    private Long machineId;

    /** 注塑机名称 */
    private String machineName;

    /** 模具ID */
    private Long moldId;

    /** 模具名称 */
    private String moldName;

    /** 报工类型 */
    private String reportType;

    /** 班次 */
    private String shift;

    /** 良品数量 */
    private Integer qty;

    /** 不良品数量 */
    private Integer badQty;

    /** 模次 */
    private Integer shots;

    /** 开始时间 */
    private LocalDateTime startTime;

    /** 结束时间 */
    private LocalDateTime endTime;

    /** 报工人 */
    private String reporterName;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
