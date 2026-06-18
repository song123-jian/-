package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 注塑机响应
 */
@Data
public class MachineResponse {

    /** ID */
    private Long id;

    /** 设备编码 */
    private String code;

    /** 设备名称 */
    private String name;

    /** 型号 */
    private String model;

    /** 吨位 */
    private BigDecimal tonnage;

    /** 状态 */
    private String status;

    /** 二维码 */
    private String qrCode;

    /** 位置 */
    private String location;

    /** 购入日期 */
    private LocalDate purchaseDate;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
