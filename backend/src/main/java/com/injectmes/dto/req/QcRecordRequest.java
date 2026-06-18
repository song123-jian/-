package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 质检记录请求
 */
@Data
public class QcRecordRequest {

    /** 生产工单ID */
    @NotNull(message = "生产工单不能为空")
    private Long prodOrderId;

    /** 产品ID */
    @NotNull(message = "产品不能为空")
    private Long productId;

    /** 检验类型 */
    @Size(max = 20, message = "检验类型长度不能超过20")
    private String checkType;

    /** 检验结果 */
    @Size(max = 20, message = "检验结果长度不能超过20")
    private String checkResult;

    /** 缺陷类型 */
    @Size(max = 50, message = "缺陷类型长度不能超过50")
    private String defectType;

    /** 缺陷描述 */
    @Size(max = 500, message = "缺陷描述长度不能超过500")
    private String defectDesc;

    /** 缺陷数量 */
    private Integer defectQty;

    /** 抽样数量 */
    private Integer sampleQty;

    /** 图片URLs */
    @Size(max = 2000, message = "图片URLs长度不能超过2000")
    private String imageUrls;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
