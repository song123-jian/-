package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 模具上下模记录响应
 */
@Data
public class MoldMountRecordResponse {

    /** ID */
    private Long id;

    /** 模具ID */
    private Long moldId;

    /** 模具名称 */
    private String moldName;

    /** 机台ID */
    private Long machineId;

    /** 机台名称 */
    private String machineName;

    /** 工单ID */
    private Long prodOrderId;

    /** 工单编号 */
    private String orderNo;

    /** 上下模类型 */
    private String mountType;

    /** 操作人ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 操作时间 */
    private LocalDateTime operateTime;

    /** 备注 */
    private String remark;
}
