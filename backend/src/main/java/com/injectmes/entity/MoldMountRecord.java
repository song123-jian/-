package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 模具上下模记录表
 */
@Data
@TableName("mold_mount_record")
public class MoldMountRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long moldId;
    private Long machineId;
    private Long prodOrderId;
    private String mountType;
    private Long operatorId;
    private LocalDateTime operateTime;
    private String remark;
}
