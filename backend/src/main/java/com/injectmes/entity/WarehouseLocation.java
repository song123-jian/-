package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 库位表
 */
@Data
@TableName("warehouse_location")
public class WarehouseLocation {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long warehouseId;
    private String code;
    private String name;
    private String area;
    private String shelf;
    private Integer layer;
    private Integer position;
    private Integer isEnabled;
}
