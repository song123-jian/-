package com.injectmes.dto.req;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 更新供应商请求
 */
@Data
public class SupplierUpdateRequest {

    /** 供应商名称 */
    @Size(max = 100, message = "供应商名称长度不能超过100")
    private String name;

    /** 联系人 */
    @Size(max = 50, message = "联系人长度不能超过50")
    private String contact;

    /** 电话 */
    @Size(max = 30, message = "电话长度不能超过30")
    private String phone;

    /** 地址 */
    @Size(max = 300, message = "地址长度不能超过300")
    private String address;

    /** 主要原料 */
    @Size(max = 200, message = "主要原料长度不能超过200")
    private String mainMaterial;

    /** 状态 */
    @Size(max = 20, message = "状态长度不能超过20")
    private String status;
}
