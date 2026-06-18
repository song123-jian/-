package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 机台设备表
 */
@Data
@TableName("machine")
public class Machine {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String model;
    private Integer tonnage;
    private String status;
    private String qrCode;
    private String location;
    private LocalDate purchaseDate;
    private String remark;
    private LocalDateTime createdAt;
}
