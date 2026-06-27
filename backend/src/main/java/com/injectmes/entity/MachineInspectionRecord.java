package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备点检记录表
 */
@Data
@TableName("machine_inspection_record")
public class MachineInspectionRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long machineId;
    private Long inspectorId;
    private LocalDateTime inspectTime;
    private String result;
    private String itemsChecked;
    private String issues;
    private String remark;
}
