package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.entity.Mold;
import com.injectmes.entity.Product;
import com.injectmes.entity.Stock;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.StockMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 预警汇总服务
 */
@Service
public class WarningService {

    private static final BigDecimal MOLD_MAINTENANCE_RATIO = new BigDecimal("0.8");
    private static final BigDecimal MOLD_LIFETIME_RATIO = new BigDecimal("0.9");

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private MoldMapper moldMapper;

    /**
     * 汇总所有预警
     */
    public List<Map<String, Object>> listWarnings() {
        List<Map<String, Object>> warnings = new ArrayList<>();
        warnings.addAll(stockWarnings());
        warnings.addAll(moldWarnings());
        warnings.sort((left, right) -> {
            int leftRank = severityRank(left.get("level"));
            int rightRank = severityRank(right.get("level"));
            if (leftRank != rightRank) {
                return Integer.compare(leftRank, rightRank);
            }
            String leftCategory = String.valueOf(left.getOrDefault("category", ""));
            String rightCategory = String.valueOf(right.getOrDefault("category", ""));
            return leftCategory.compareTo(rightCategory);
        });
        return warnings;
    }

    /**
     * 预警统计
     */
    public Map<String, Object> summary() {
        List<Map<String, Object>> warnings = listWarnings();
        Map<String, Object> summary = new HashMap<>();
        summary.put("total", warnings.size());
        summary.put("warning", warnings.stream().filter(item -> "WARNING".equals(item.get("level"))).count());
        summary.put("error", warnings.stream().filter(item -> "ERROR".equals(item.get("level"))).count());
        summary.put("stock", warnings.stream().filter(item -> "库存".equals(item.get("category"))).count());
        summary.put("mold", warnings.stream().filter(item -> "模具".equals(item.get("category"))).count());
        return summary;
    }

    private List<Map<String, Object>> stockWarnings() {
        List<Map<String, Object>> warnings = new ArrayList<>();
        List<Product> products = productMapper.selectList(
                new LambdaQueryWrapper<Product>().gt(Product::getSafeStock, 0)
        );
        for (Product product : products) {
            List<Stock> stocks = stockMapper.selectList(
                    new LambdaQueryWrapper<Stock>().eq(Stock::getProductId, product.getId())
            );
            int totalAvailable = stocks.stream()
                    .mapToInt(s -> (s.getQty() != null ? s.getQty() : 0) - (s.getLockedQty() != null ? s.getLockedQty() : 0))
                    .sum();
            if (totalAvailable < product.getSafeStock()) {
                Map<String, Object> warning = new HashMap<>();
                warning.put("category", "库存");
                warning.put("level", "WARNING");
                warning.put("type", "安全库存预警");
                warning.put("title", "库存不足");
                warning.put("targetId", product.getId());
                warning.put("targetName", product.getName());
                warning.put("value", totalAvailable);
                warning.put("threshold", product.getSafeStock());
                warning.put("message", product.getName() + " 可用库存" + totalAvailable + "，低于安全库存" + product.getSafeStock());
                warnings.add(warning);
            }
        }
        return warnings;
    }

    private List<Map<String, Object>> moldWarnings() {
        List<Map<String, Object>> warnings = new ArrayList<>();
        List<Mold> molds = moldMapper.selectList(
                new LambdaQueryWrapper<Mold>().ne(Mold::getStatus, "SCRAP")
        );

        for (Mold mold : molds) {
            int usedShots = mold.getUsedShots() != null ? mold.getUsedShots() : 0;
            int shotsSinceMaintenance = mold.getShotsSinceMaintenance() != null
                    ? mold.getShotsSinceMaintenance()
                    : usedShots;

            if (mold.getMaintenanceCycle() != null && mold.getMaintenanceCycle() > 0) {
                BigDecimal maintenanceThreshold = new BigDecimal(mold.getMaintenanceCycle()).multiply(MOLD_MAINTENANCE_RATIO);
                if (new BigDecimal(shotsSinceMaintenance).compareTo(maintenanceThreshold) >= 0) {
                    Map<String, Object> warning = new HashMap<>();
                    warning.put("category", "模具");
                    warning.put("level", "WARNING");
                    warning.put("type", "模具保养预警");
                    warning.put("title", "模具保养");
                    warning.put("targetId", mold.getId());
                    warning.put("targetName", mold.getCode());
                    warning.put("value", shotsSinceMaintenance);
                    warning.put("threshold", mold.getMaintenanceCycle());
                    warning.put("message", String.format("模具 %s（%s）已使用 %d 模次，达到保养周期 %d 的 %.0f%%，请安排保养！",
                            mold.getCode(), mold.getName(), shotsSinceMaintenance, mold.getMaintenanceCycle(),
                            MOLD_MAINTENANCE_RATIO.multiply(new BigDecimal("100"))));
                    warnings.add(warning);
                }
            }

            if (mold.getLifetime() != null && mold.getLifetime() > 0) {
                BigDecimal lifetimeThreshold = new BigDecimal(mold.getLifetime()).multiply(MOLD_LIFETIME_RATIO);
                if (new BigDecimal(usedShots).compareTo(lifetimeThreshold) >= 0) {
                    Map<String, Object> warning = new HashMap<>();
                    warning.put("category", "模具");
                    warning.put("level", "ERROR");
                    warning.put("type", "模具寿命预警");
                    warning.put("title", "模具寿命");
                    warning.put("targetId", mold.getId());
                    warning.put("targetName", mold.getCode());
                    warning.put("value", usedShots);
                    warning.put("threshold", mold.getLifetime());
                    warning.put("message", String.format("模具 %s（%s）已使用 %d 模次，达到设计寿命 %d 的 %.0f%%，请考虑更换！",
                            mold.getCode(), mold.getName(), usedShots, mold.getLifetime(),
                            MOLD_LIFETIME_RATIO.multiply(new BigDecimal("100"))));
                    warnings.add(warning);
                }
            }
        }
        return warnings;
    }

    private int severityRank(Object level) {
        if ("ERROR".equals(level)) {
            return 0;
        }
        if ("WARNING".equals(level)) {
            return 1;
        }
        return 2;
    }
}
