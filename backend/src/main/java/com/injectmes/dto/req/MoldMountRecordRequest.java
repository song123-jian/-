package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 模具上下模记录请求
 */
@Data
public class MoldMountRecordRequest {

    /** 模具ID */
    @NotNull(message = "模具不能为空")
    private Long moldId;

    /** 机台ID */
    @NotNull(message = "机台不能为空")
    private Long machineId;

    /** 生产工单ID */
    private Long prodOrderId;

    /** 上下模类型 */
    @NotNull(message = "上下模类型不能为空")
    @Size(max = 20, message = "上下模类型长度不能超过20")
    private String mountType;

    /** 操作人ID */
    @NotNull(message = "操作人不能为空")
    private Long operatorId;

    /** 操作时间 */
    private LocalDateTime operateTime;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
