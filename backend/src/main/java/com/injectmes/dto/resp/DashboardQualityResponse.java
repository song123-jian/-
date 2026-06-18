package com.injectmes.dto.resp;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 质量看板响应
 */
@Data
public class DashboardQualityResponse {

    /** 总检验数量 */
    private Integer totalCheckQty;

    /** 合格数量 */
    private Integer passQty;

    /** 不合格数量 */
    private Integer failQty;

    /** 合格率 */
    private BigDecimal passRate;

    /** 不良TOP列表 */
    private List<TopDefect> topDefects;

    /** 趋势数据 */
    private List<TrendData> trendData;

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

    /**
     * 趋势数据
     */
    @Data
    public static class TrendData {

        /** 日期 */
        private String date;

        /** 检验数量 */
        private Integer checkQty;

        /** 合格数量 */
        private Integer passQty;

        /** 不合格数量 */
        private Integer failQty;

        /** 合格率 */
        private BigDecimal passRate;
    }
}
