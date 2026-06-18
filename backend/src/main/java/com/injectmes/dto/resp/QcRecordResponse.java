package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 质检记录响应
 */
@Data
public class QcRecordResponse {

    /** ID */
    private Long id;

    /** 生产工单ID */
    private Long prodOrderId;

    /** 工单编号 */
    private String orderNo;

    /** 产品ID */
    private Long productId;

    /** 产品名称 */
    private String productName;

    /** 检验类型 */
    private String checkType;

    /** 检验结果 */
    private String checkResult;

    /** 缺陷类型 */
    private String defectType;

    /** 缺陷描述 */
    private String defectDesc;

    /** 缺陷数量 */
    private Integer defectQty;

    /** 抽样数量 */
    private Integer sampleQty;

    /** 图片URLs */
    private String imageUrls;

    /** 备注 */
    private String remark;

    /** 检验人 */
    private String checkerName;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
