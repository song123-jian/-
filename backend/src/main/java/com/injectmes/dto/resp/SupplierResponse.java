package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 供应商响应
 */
@Data
public class SupplierResponse {

    /** ID */
    private Long id;

    /** 供应商编码 */
    private String code;

    /** 供应商名称 */
    private String name;

    /** 联系人 */
    private String contact;

    /** 电话 */
    private String phone;

    /** 地址 */
    private String address;

    /** 主要原料 */
    private String mainMaterial;

    /** 状态 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;
}
