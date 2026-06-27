package com.injectmes.dto.resp;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 首页工作台响应
 */
@Data
public class DashboardHomeResponse {

    /** 今日产量 */
    private Integer todayProductionQty;

    /** 待处理工单数 */
    private Integer pendingOrderQty;

    /** 在线机台数 */
    private Integer runningMachineQty;

    /** 未读消息数 */
    private Long unreadNotificationQty;

    /** 近7日产量趋势 */
    private List<ProductionTrend> productionTrend;

    /** 订单状态分布 */
    private List<OrderStatusItem> orderStatusDistribution;

    /** 待办事项 */
    private List<TodoItem> todoList;

    /**
     * 产量趋势
     */
    @Data
    public static class ProductionTrend {

        /** 日期 */
        private String date;

        /** 产量 */
        private Integer qty;
    }

    /**
     * 订单状态
     */
    @Data
    public static class OrderStatusItem {

        /** 状态码 */
        private String status;

        /** 状态名称 */
        private String label;

        /** 数量 */
        private Integer count;
    }

    /**
     * 待办事项
     */
    @Data
    public static class TodoItem {

        /** 类型 */
        private String type;

        /** 内容 */
        private String content;

        /** 时间 */
        private LocalDateTime time;

        /** 优先级 */
        private String status;
    }
}
