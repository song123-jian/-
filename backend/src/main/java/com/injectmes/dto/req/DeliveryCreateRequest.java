package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 创建发货请求
 */
@Data
public class DeliveryCreateRequest {

    /** 销售订单ID */
    @NotNull(message = "销售订单不能为空")
    private Long saleOrderId;

    /** 发货日期 */
    @NotNull(message = "发货日期不能为空")
    private LocalDate deliveryDate;

    /** 物流公司 */
    @Size(max = 100, message = "物流公司长度不能超过100")
    private String logisticsCompany;

    /** 物流单号 */
    @Size(max = 100, message = "物流单号长度不能超过100")
    private String trackingNo;

    /** 发货明细 */
    @NotNull(message = "发货明细不能为空")
    @Valid
    private List<DeliveryItemDTO> items;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;
}
