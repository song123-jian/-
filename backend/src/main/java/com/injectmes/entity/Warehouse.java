package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 仓库表
 */
@Data
@TableName("warehouse")
public class Warehouse {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String type;
    private String address;
    private String factoryCode;
    private String workshop;
    private Long managerId;
    private Integer isEnabled;
    private LocalDateTime createdAt;
}
