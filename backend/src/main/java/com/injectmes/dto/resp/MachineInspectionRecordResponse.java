package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备点检响应
 */
@Data
public class MachineInspectionRecordResponse {
    private Long id;
    private Long machineId;
    private String machineName;
    private Long inspectorId;
    private String inspectorName;
    private LocalDateTime inspectTime;
    private String result;
    private String itemsChecked;
    private String issues;
    private String remark;
}
