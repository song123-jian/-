package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 仓库响应
 */
@Data
public class WarehouseResponse {

    /** ID */
    private Long id;

    /** 仓库编码 */
    private String code;

    /** 仓库名称 */
    private String name;

    /** 仓库类型 */
    private String type;

    /** 地址 */
    private String address;

    /** 管理员ID */
    private Long managerId;

    /** 管理员名称 */
    private String managerName;

    /** 状态 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;
}
