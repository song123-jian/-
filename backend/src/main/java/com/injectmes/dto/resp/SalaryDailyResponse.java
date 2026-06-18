package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 日工资响应
 */
@Data
public class SalaryDailyResponse {

    /** ID */
    private Long id;

    /** 用户ID */
    private Long userId;

    /** 用户名 */
    private String username;

    /** 真实姓名 */
    private String realName;

    /** 日期 */
    private LocalDate workDate;

    /** 生产工单ID */
    private Long prodOrderId;

    /** 工单编号 */
    private String orderNo;

    /** 产品ID */
    private Long productId;

    /** 产品名称 */
    private String productName;

    /** 良品数量 */
    private Integer qty;

    /** 不良品数量 */
    private Integer badQty;

    /** 计件单价 */
    private BigDecimal piecePrice;

    /** 计件工资 */
    private BigDecimal pieceSalary;

    /** 状态 */
    private String status;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
