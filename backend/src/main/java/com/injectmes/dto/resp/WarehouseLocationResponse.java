package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 库位响应
 */
@Data
public class WarehouseLocationResponse {

    /** ID */
    private Long id;

    /** 仓库ID */
    private Long warehouseId;

    /** 仓库名称 */
    private String warehouseName;

    /** 库位编码 */
    private String code;

    /** 库位名称 */
    private String name;

    /** 区域 */
    private String area;

    /** 货架 */
    private String shelf;

    /** 层 */
    private String layer;

    /** 位 */
    private String position;

    /** 状态 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 更新时间 */
    private LocalDateTime updatedAt;
}
