package com.injectmes.dto.resp;

import lombok.Data;

import java.util.List;

/**
 * 生产看板响应
 */
@Data
public class DashboardProductionResponse {

    /** 设备状态列表 */
    private List<MachineStatus> machineStatuses;

    /** 工单进度列表 */
    private List<OrderProgress> orderProgresses;

    /** 班次产量列表 */
    private List<ShiftOutput> shiftOutputs;

    /** 不良TOP列表 */
    private List<TopDefect> topDefects;

    /**
     * 设备状态
     */
    @Data
    public static class MachineStatus {

        /** 设备ID */
        private Long machineId;

        /** 设备名称 */
        private String machineName;

        /** 状态 */
        private String status;

        /** 当前工单编号 */
        private String orderNo;

        /** 产品名称 */
        private String productName;
    }

    /**
     * 工单进度
     */
    @Data
    public static class OrderProgress {

        /** 工单ID */
        private Long orderId;

        /** 工单编号 */
        private String orderNo;

        /** 产品名称 */
        private String productName;

        /** 计划数量 */
        private Integer planQty;

        /** 完成数量 */
        private Integer completedQty;

        /** 完成率 */
        private java.math.BigDecimal completionRate;

        /** 状态 */
        private String status;
    }

    /**
     * 班次产量
     */
    @Data
    public static class ShiftOutput {

        /** 班次 */
        private String shift;

        /** 良品数量 */
        private Integer qty;

        /** 不良品数量 */
        private Integer badQty;
    }

    /**
     * 不良TOP
     */
    @Data
    public static class TopDefect {

        /** 缺陷类型 */
        private String defectType;

        /** 数量 */
        private Integer qty;
    }
}
