package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备点检请求
 */
@Data
public class MachineInspectionRecordRequest {

    @NotNull(message = "机台不能为空")
    private Long machineId;

    @NotNull(message = "点检人不能为空")
    private Long inspectorId;

    private LocalDateTime inspectTime;

    @NotNull(message = "点检结果不能为空")
    @Size(max = 20, message = "点检结果长度不能超过20")
    private String result;

    @Size(max = 500, message = "点检项目长度不能超过500")
    private String itemsChecked;

    @Size(max = 500, message = "异常描述长度不能超过500")
    private String issues;

    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
