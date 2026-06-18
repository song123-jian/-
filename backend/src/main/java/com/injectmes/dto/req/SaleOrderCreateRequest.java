package com.injectmes.dto.req;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 创建销售订单请求
 */
@Data
public class SaleOrderCreateRequest {

    /** 客户ID */
    @NotNull(message = "客户不能为空")
    private Long customerId;

    /** 订单日期 */
    @NotNull(message = "订单日期不能为空")
    private LocalDate orderDate;

    /** 交货日期 */
    private LocalDate deliveryDate;

    /** 备注 */
    @Size(max = 500, message = "备注长度不能超过500")
    private String remark;

    /** 订单明细 */
    @NotNull(message = "订单明细不能为空")
    @Valid
    private List<SaleOrderItemDTO> items;
}
