package com.injectmes.task;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.entity.*;
import com.injectmes.mapper.*;
import com.injectmes.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 预警检查定时任务
 * 每30分钟执行预警检查（严格按技术文档12.1节）
 */
@Component
public class WarningCheckTask {

    private static final Logger log = LoggerFactory.getLogger(WarningCheckTask.class);

    /** 不良率预警阈值（%） */
    private static final BigDecimal BAD_RATE_WARNING = new BigDecimal("5");
    /** 交期预警天数 */
    private static final int DELIVERY_WARNING_DAYS = 3;
    /** 超期未回款天数 */
    private static final int OVERDUE_PAYMENT_DAYS = 30;
    /** 停机超时阈值（分钟） */
    private static final int DOWNTIME_TIMEOUT_MINUTES = 60;
    /** 效期预警天数 */
    private static final int EXPIRY_WARNING_DAYS = 30;
    /** 模具保养预警比例（达到保养周期的80%时预警） */
    private static final BigDecimal MOLD_MAINTENANCE_RATIO = new BigDecimal("0.8");
    /** 模具寿命预警比例（达到设计寿命的90%时预警） */
    private static final BigDecimal MOLD_LIFETIME_RATIO = new BigDecimal("0.9");

    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private SaleOrderMapper saleOrderMapper;
    @Autowired
    private PaymentRecordMapper paymentRecordMapper;
    @Autowired
    private ProductMapper productMapper;
    @Autowired
    private StockMapper stockMapper;
    @Autowired
    private MaterialBatchMapper materialBatchMapper;
    @Autowired
    private MoldMapper moldMapper;
    @Autowired
    private MachineMapper machineMapper;
    @Autowired
    private DowntimeRecordMapper downtimeRecordMapper;
    @Autowired
    private NotificationService notificationService;

    /**
     * 每30分钟执行预警检查
     */
    @Scheduled(cron = "0 */30 * * * ?")
    public void checkWarnings() {
        log.info("========== 开始执行预警检查 ==========");

        try {
            // 1. 交期预警：交期前3天工单未完工
            checkDeliveryWarning();
        } catch (Exception e) {
            log.error("交期预警检查异常：{}", e.getMessage());
        }

        try {
            // 2. 库存不足：成品库存 < 安全库存
            checkStockWarning();
        } catch (Exception e) {
            log.error("库存不足预警检查异常：{}", e.getMessage());
        }

        try {
            // 3. 原料不足：原料库存不足以支撑工单
            checkRawMaterialWarning();
        } catch (Exception e) {
            log.error("原料不足预警检查异常：{}", e.getMessage());
        }

        try {
            // 4. 模具保养：模次达到保养周期的80%
            checkMoldMaintenanceWarning();
        } catch (Exception e) {
            log.error("模具保养预警检查异常：{}", e.getMessage());
        }

        try {
            // 5. 模具寿命：模次达到设计寿命的90%
            checkMoldLifetimeWarning();
        } catch (Exception e) {
            log.error("模具寿命预警检查异常：{}", e.getMessage());
        }

        try {
            // 6. 超期未回款：超过账期30天未回款
            checkOverduePaymentWarning();
        } catch (Exception e) {
            log.error("超期未回款预警检查异常：{}", e.getMessage());
        }

        try {
            // 7. 不良率异常：单工单不良率 > 5%
            checkBadRateWarning();
        } catch (Exception e) {
            log.error("不良率异常预警检查异常：{}", e.getMessage());
        }

        try {
            // 8. 停机超时：非计划停机 > 60分钟
            checkDowntimeTimeoutWarning();
        } catch (Exception e) {
            log.error("停机超时预警检查异常：{}", e.getMessage());
        }

        try {
            // 9. 效期预警：原料批次30天内过期
            checkExpiryWarning();
        } catch (Exception e) {
            log.error("效期预警检查异常：{}", e.getMessage());
        }

        log.info("========== 预警检查完成 ==========");
    }

    /**
     * 交期预警：交期前3天工单未完工
     */
    private void checkDeliveryWarning() {
        LocalDate warningDate = LocalDate.now().plusDays(DELIVERY_WARNING_DAYS);

        // 查询未完工的生产工单
        LambdaQueryWrapper<ProdOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(ProdOrder::getStatus, "SCHEDULED", "RUNNING", "PAUSED");
        List<ProdOrder> activeOrders = prodOrderMapper.selectList(wrapper);

        for (ProdOrder order : activeOrders) {
            // 通过销售订单获取交期
            if (order.getSaleOrderId() != null) {
                SaleOrder saleOrder = saleOrderMapper.selectById(order.getSaleOrderId());
                if (saleOrder != null && saleOrder.getDeliveryDate() != null) {
                    long daysToDelivery = ChronoUnit.DAYS.between(LocalDate.now(), saleOrder.getDeliveryDate());
                    if (daysToDelivery <= DELIVERY_WARNING_DAYS && daysToDelivery >= 0) {
                        Product product = order.getProductId() != null ? productMapper.selectById(order.getProductId()) : null;
                        String productName = product != null ? product.getName() : "未知产品";
                        String content = String.format("工单 %s（%s）交期还剩 %d 天，请尽快安排生产！",
                                order.getOrderNo(), productName, daysToDelivery);
                        notificationService.broadcastNotification("交期预警", content, "WARNING");
                        log.info("交期预警：{}", content);
                    }
                }
            }
        }
    }

    /**
     * 库存不足：成品库存 < 安全库存
     */
    private void checkStockWarning() {
        // 查询所有成品库存
        LambdaQueryWrapper<Stock> stockWrapper = new LambdaQueryWrapper<>();
        stockWrapper.gt(Stock::getQty, 0);
        List<Stock> stocks = stockMapper.selectList(stockWrapper);

        for (Stock stock : stocks) {
            Product product = productMapper.selectById(stock.getProductId());
            if (product != null && product.getSafeStock() != null && product.getSafeStock() > 0) {
                int availableQty = stock.getQty() - (stock.getLockedQty() != null ? stock.getLockedQty() : 0);
                if (availableQty < product.getSafeStock()) {
                    String content = String.format("产品 %s 当前库存 %d，低于安全库存 %d，请及时补货！",
                            product.getName(), availableQty, product.getSafeStock());
                    notificationService.broadcastNotification("库存不足预警", content, "WARNING");
                    log.info("库存不足预警：{}", content);
                }
            }
        }
    }

    /**
     * 原料不足：原料库存不足以支撑工单
     */
    private void checkRawMaterialWarning() {
        // 查询正在生产的工单
        LambdaQueryWrapper<ProdOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProdOrder::getStatus, "RUNNING");
        List<ProdOrder> runningOrders = prodOrderMapper.selectList(wrapper);

        for (ProdOrder order : runningOrders) {
            if (order.getProductId() != null) {
                Product product = productMapper.selectById(order.getProductId());
                if (product != null && product.getRawMaterialId() != null && product.getRawMaterialUsage() != null) {
                    // 计算该工单剩余需要的原料数量
                    int remainingQty = order.getPlanQty() - (order.getCompletedQty() != null ? order.getCompletedQty() : 0);
                    BigDecimal neededRawMaterial = product.getRawMaterialUsage().multiply(new BigDecimal(remainingQty));

                    // 查询原料库存总量
                    LambdaQueryWrapper<Stock> rawStockWrapper = new LambdaQueryWrapper<>();
                    rawStockWrapper.eq(Stock::getProductId, product.getRawMaterialId());
                    List<Stock> rawStocks = stockMapper.selectList(rawStockWrapper);
                    int totalRawQty = rawStocks.stream()
                            .mapToInt(s -> s.getQty() != null ? s.getQty() : 0)
                            .sum();

                    if (new BigDecimal(totalRawQty).compareTo(neededRawMaterial) < 0) {
                        Product rawMaterial = productMapper.selectById(product.getRawMaterialId());
                        String rawName = rawMaterial != null ? rawMaterial.getName() : "未知原料";
                        String content = String.format("工单 %s 所需原料 %s 库存不足，需要 %.2f，当前库存 %d！",
                                order.getOrderNo(), rawName, neededRawMaterial, totalRawQty);
                        notificationService.broadcastNotification("原料不足预警", content, "WARNING");
                        log.info("原料不足预警：{}", content);
                    }
                }
            }
        }
    }

    /**
     * 模具保养：模次达到保养周期的80%
     */
    private void checkMoldMaintenanceWarning() {
        LambdaQueryWrapper<Mold> wrapper = new LambdaQueryWrapper<>();
        wrapper.ne(Mold::getStatus, "SCRAPPED");
        List<Mold> molds = moldMapper.selectList(wrapper);

        for (Mold mold : molds) {
            if (mold.getMaintenanceCycle() != null && mold.getMaintenanceCycle() > 0 && mold.getUsedShots() != null) {
                // 计算自上次保养以来的模次（简化：直接用usedShots与maintenanceCycle比较）
                int threshold = new BigDecimal(mold.getMaintenanceCycle())
                        .multiply(MOLD_MAINTENANCE_RATIO)
                        .intValue();
                if (mold.getUsedShots() >= threshold) {
                    String content = String.format("模具 %s（%s）已使用 %d 模次，达到保养周期 %d 的 %.0f%%，请安排保养！",
                            mold.getCode(), mold.getName(), mold.getUsedShots(),
                            mold.getMaintenanceCycle(), MOLD_MAINTENANCE_RATIO.multiply(new BigDecimal("100")));
                    notificationService.broadcastNotification("模具保养预警", content, "WARNING");
                    log.info("模具保养预警：{}", content);
                }
            }
        }
    }

    /**
     * 模具寿命：模次达到设计寿命的90%
     */
    private void checkMoldLifetimeWarning() {
        LambdaQueryWrapper<Mold> wrapper = new LambdaQueryWrapper<>();
        wrapper.ne(Mold::getStatus, "SCRAPPED");
        List<Mold> molds = moldMapper.selectList(wrapper);

        for (Mold mold : molds) {
            if (mold.getLifetime() != null && mold.getLifetime() > 0 && mold.getUsedShots() != null) {
                int threshold = new BigDecimal(mold.getLifetime())
                        .multiply(MOLD_LIFETIME_RATIO)
                        .intValue();
                if (mold.getUsedShots() >= threshold) {
                    String content = String.format("模具 %s（%s）已使用 %d 模次，达到设计寿命 %d 的 %.0f%%，请考虑更换！",
                            mold.getCode(), mold.getName(), mold.getUsedShots(),
                            mold.getLifetime(), MOLD_LIFETIME_RATIO.multiply(new BigDecimal("100")));
                    notificationService.broadcastNotification("模具寿命预警", content, "ERROR");
                    log.info("模具寿命预警：{}", content);
                }
            }
        }
    }

    /**
     * 超期未回款：超过账期30天未回款
     */
    private void checkOverduePaymentWarning() {
        LocalDate overdueDate = LocalDate.now().minusDays(OVERDUE_PAYMENT_DAYS);

        // 查询所有未完全回款的订单
        LambdaQueryWrapper<SaleOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.ne(SaleOrder::getStatus, "DRAFT");
        wrapper.ne(SaleOrder::getStatus, "CANCELLED");
        wrapper.le(SaleOrder::getOrderDate, overdueDate);
        List<SaleOrder> orders = saleOrderMapper.selectList(wrapper);

        for (SaleOrder order : orders) {
            BigDecimal totalAmount = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
            BigDecimal receivedAmount = order.getReceivedAmount() != null ? order.getReceivedAmount() : BigDecimal.ZERO;
            if (receivedAmount.compareTo(totalAmount) < 0) {
                long overdueDays = ChronoUnit.DAYS.between(order.getOrderDate(), LocalDate.now());
                BigDecimal remaining = totalAmount.subtract(receivedAmount);
                String content = String.format("销售订单 %s 已超期 %d 天未完全回款，剩余金额：%.2f 元！",
                        order.getOrderNo(), overdueDays, remaining);
                notificationService.broadcastNotification("超期未回款预警", content, "WARNING");
                log.info("超期未回款预警：{}", content);
            }
        }
    }

    /**
     * 不良率异常：单工单不良率 > 5%
     */
    private void checkBadRateWarning() {
        // 查询正在生产的工单
        LambdaQueryWrapper<ProdOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProdOrder::getStatus, "RUNNING");
        List<ProdOrder> runningOrders = prodOrderMapper.selectList(wrapper);

        for (ProdOrder order : runningOrders) {
            int completedQty = order.getCompletedQty() != null ? order.getCompletedQty() : 0;
            int badQty = order.getBadQty() != null ? order.getBadQty() : 0;

            if (completedQty > 0) {
                BigDecimal badRate = new BigDecimal(badQty).multiply(new BigDecimal("100"))
                        .divide(new BigDecimal(completedQty), 2, RoundingMode.HALF_UP);

                if (badRate.compareTo(BAD_RATE_WARNING) > 0) {
                    Product product = order.getProductId() != null ? productMapper.selectById(order.getProductId()) : null;
                    String productName = product != null ? product.getName() : "未知产品";
                    String content = String.format("工单 %s（%s）不良率 %.2f%% 超过阈值 %.0f%%，请及时处理！",
                            order.getOrderNo(), productName, badRate, BAD_RATE_WARNING);
                    notificationService.broadcastNotification("不良率异常预警", content, "ERROR");
                    log.info("不良率异常预警：{}", content);
                }
            }
        }
    }

    /**
     * 停机超时：非计划停机 > 60分钟
     */
    private void checkDowntimeTimeoutWarning() {
        // 查询未结束的停机记录
        LambdaQueryWrapper<DowntimeRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.isNull(DowntimeRecord::getEndTime);
        // 排除计划停机（换模、休息）
        wrapper.notIn(DowntimeRecord::getReason, "MOLD_CHANGE", "BREAK");
        List<DowntimeRecord> activeDowntimes = downtimeRecordMapper.selectList(wrapper);

        for (DowntimeRecord record : activeDowntimes) {
            if (record.getStartTime() != null) {
                long minutes = ChronoUnit.MINUTES.between(record.getStartTime(), LocalDateTime.now());
                if (minutes > DOWNTIME_TIMEOUT_MINUTES) {
                    Machine machine = record.getMachineId() != null ? machineMapper.selectById(record.getMachineId()) : null;
                    String machineName = machine != null ? machine.getName() : "未知机台";
                    String content = String.format("机台 %s 非计划停机已超过 %d 分钟（原因：%s），请及时处理！",
                            machineName, minutes, record.getReason());
                    notificationService.broadcastNotification("停机超时预警", content, "ERROR");
                    log.info("停机超时预警：{}", content);
                }
            }
        }
    }

    /**
     * 效期预警：原料批次30天内过期
     */
    private void checkExpiryWarning() {
        LocalDate warningDate = LocalDate.now().plusDays(EXPIRY_WARNING_DAYS);

        LambdaQueryWrapper<MaterialBatch> wrapper = new LambdaQueryWrapper<>();
        wrapper.isNotNull(MaterialBatch::getExpiryDate);
        wrapper.le(MaterialBatch::getExpiryDate, warningDate);
        wrapper.gt(MaterialBatch::getExpiryDate, LocalDate.now());
        wrapper.gt(MaterialBatch::getRemainingQty, 0);
        List<MaterialBatch> batches = materialBatchMapper.selectList(wrapper);

        for (MaterialBatch batch : batches) {
            long daysToExpiry = ChronoUnit.DAYS.between(LocalDate.now(), batch.getExpiryDate());
            Product product = batch.getProductId() != null ? productMapper.selectById(batch.getProductId()) : null;
            String productName = product != null ? product.getName() : "未知原料";
            String content = String.format("原料批次 %s（%s）将在 %d 天后过期，剩余数量 %d，请尽快使用！",
                    batch.getBatchNo(), productName, daysToExpiry, batch.getRemainingQty());
            notificationService.broadcastNotification("效期预警", content, "WARNING");
            log.info("效期预警：{}", content);
        }
    }
}
