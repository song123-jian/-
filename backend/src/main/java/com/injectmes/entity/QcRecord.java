package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 质检记录表
 */
@Data
@TableName("qc_record")
public class QcRecord {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long prodOrderId;
    private Long productId;
    private String checkType;
    private String checkResult;
    private String defectType;
    private String defectDesc;
    private Integer defectQty;
    private Integer sampleQty;
    private Long checkerId;
    private LocalDateTime checkTime;
    private String imageUrls;
    private String remark;
    private LocalDateTime createdAt;
}
