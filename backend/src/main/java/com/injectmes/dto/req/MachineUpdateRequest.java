package com.injectmes.dto.req;

import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 更新注塑机请求
 */
@Data
public class MachineUpdateRequest {

    /** 设备名称 */
    @Size(max = 100, message = "设备名称长度不能超过100")
    private String name;

    /** 状态 */
    @Size(max = 20, message = "状态长度不能超过20")
    private String status;

    /** 型号 */
    @Size(max = 100, message = "型号长度不能超过100")
    private String model;

    /** 吨位 */
    private BigDecimal tonnage;

    /** 位置 */
    @Size(max = 200, message = "位置长度不能超过200")
    private String location;

    /** 工厂编码 */
    @Size(max = 50, message = "工厂编码长度不能超过50")
    private String factoryCode;

    /** 车间 */
    @Size(max = 100, message = "车间长度不能超过100")
    private String workshop;

    /** 购入日期 */
    private LocalDate purchaseDate;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
