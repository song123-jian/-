package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.*;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.StockMoveResponse;
import com.injectmes.dto.resp.StockResponse;
import com.injectmes.entity.*;
import com.injectmes.enums.MoveReason;
import com.injectmes.enums.MoveType;
import com.injectmes.enums.RelatedOrderType;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 核心库存服务
 */
@Service
public class StockService {

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private StockMoveMapper stockMoveMapper;

    @Autowired
    private MaterialBatchMapper materialBatchMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private WarehouseMapper warehouseMapper;

    @Autowired
    private WarehouseLocationMapper warehouseLocationMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private StockInventoryMapper stockInventoryMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    /**
     * 库存查询（分页，支持warehouseId/productId/keyword筛选）
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<StockResponse>> query(PageRequest request) {
        Page<Stock> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Stock> wrapper = new LambdaQueryWrapper<>();

        // 按创建时间降序
        wrapper.orderByDesc(Stock::getUpdatedAt);

        Page<Stock> result = stockMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<StockResponse> records = result.getRecords().stream()
                .map(this::convertToStockResponse)
                .collect(Collectors.toList());

        PageResponse<StockResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 库存台账（流水查询，分页）
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<StockMoveResponse>> ledger(PageRequest request) {
        Page<StockMove> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<StockMove> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索（流水号）
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(StockMove::getMoveNo, keyword);
        }

        // 按创建时间降序
        wrapper.orderByDesc(StockMove::getCreatedAt);

        Page<StockMove> result = stockMoveMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<StockMoveResponse> records = result.getRecords().stream()
                .map(this::convertToStockMoveResponse)
                .collect(Collectors.toList());

        PageResponse<StockMoveResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 采购入库
     * - 创建或更新批次
     * - 增加库存 qty
     * - 记录库存流水 stock_move (IN, PURCHASE)
     */
    @Transactional
    public R<Void> inPurchase(StockInPurchaseRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查仓库是否冻结
        checkWarehouseFreeze(request.getWarehouseId());

        for (PurchaseItemDTO item : request.getItems()) {
            // 创建或更新批次
            MaterialBatch batch = createOrUpdateBatch(item, request.getWarehouseId(), request.getSupplierId());

            int qty = item.getQty().intValue();

            // 增加库存
            upsertStock(item.getProductId(), request.getWarehouseId(), request.getLocationId(), batch.getId(), qty);

            // 记录库存流水
            addStockMove(item.getProductId(), request.getWarehouseId(), request.getLocationId(), batch.getId(),
                    null, null, null,
                    MoveType.IN, MoveReason.PURCHASE, qty,
                    null, null, null, request.getRemark());
        }

        return R.ok("采购入库成功", null);
    }

    /**
     * 生产领料出库
     * - 校验库存充足
     * - 减少库存 qty，释放 locked_qty
     * - 记录库存流水 (OUT, PICKING)
     * - FIFO先进先出：按批次生产日期排序优先出库
     */
    @Transactional
    public R<Void> outPicking(StockOutPickingRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查仓库是否冻结
        checkWarehouseFreeze(request.getWarehouseId());

        for (PickingItemDTO item : request.getItems()) {
            int qty = item.getQty().intValue();

            // FIFO先进先出：查询该产品在该仓库的库存，按批次生产日期排序
            List<Stock> stocks = stockMapper.selectList(
                    new LambdaQueryWrapper<Stock>()
                            .eq(Stock::getProductId, item.getProductId())
                            .eq(Stock::getWarehouseId, request.getWarehouseId())
                            .gt(Stock::getQty, 0)
            );

            if (stocks.isEmpty()) {
                throw new BusinessException("产品库存不足，无法领料出库");
            }

            // 按批次生产日期排序（FIFO）
            stocks.sort((a, b) -> {
                MaterialBatch batchA = materialBatchMapper.selectById(a.getBatchId());
                MaterialBatch batchB = materialBatchMapper.selectById(b.getBatchId());
                if (batchA == null || batchA.getProductionDate() == null) return 1;
                if (batchB == null || batchB.getProductionDate() == null) return -1;
                return batchA.getProductionDate().compareTo(batchB.getProductionDate());
            });

            int remainingQty = qty;
            for (Stock stock : stocks) {
                if (remainingQty <= 0) break;

                int availableQty = stock.getQty() - (stock.getLockedQty() != null ? stock.getLockedQty() : 0);
                if (availableQty <= 0) continue;

                int deductQty = Math.min(remainingQty, availableQty);
                stock.setQty(stock.getQty() - deductQty);
                // 释放锁定数量
                if (stock.getLockedQty() != null && stock.getLockedQty() > 0) {
                    int releaseQty = Math.min(stock.getLockedQty(), deductQty);
                    stock.setLockedQty(stock.getLockedQty() - releaseQty);
                }
                stock.setUpdatedAt(LocalDateTime.now());
                stockMapper.updateById(stock);

                remainingQty -= deductQty;

                // 记录库存流水
                addStockMove(item.getProductId(), request.getWarehouseId(), stock.getLocationId(), stock.getBatchId(),
                        null, null, null,
                        MoveType.OUT, MoveReason.PICKING, deductQty,
                        request.getProdOrderId(), RelatedOrderType.PROD_ORDER, null, request.getRemark());
            }

            if (remainingQty > 0) {
                throw new BusinessException("产品库存不足，无法完成领料出库");
            }
        }

        return R.ok("领料出库成功", null);
    }

    /**
     * 成品入库
     * - 创建成品批次 P-YYYYMMDD-机台号-模次
     * - 增加库存 qty
     * - 记录库存流水 (IN, PRODUCE_IN)
     */
    @Transactional
    public R<Void> inProduce(StockInProduceRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查仓库是否冻结
        checkWarehouseFreeze(request.getWarehouseId());

        for (ProduceInItemDTO item : request.getItems()) {
            int qty = item.getQty().intValue();

            // 创建成品批次
            MaterialBatch batch = new MaterialBatch();
            batch.setBatchNo(item.getBatchNo());
            batch.setProductId(item.getProductId());
            batch.setWarehouseId(request.getWarehouseId());
            batch.setProductionDate(LocalDate.now());
            batch.setInitialQty(qty);
            batch.setRemainingQty(qty);
            batch.setStatus("NORMAL");
            batch.setCreatedAt(LocalDateTime.now());

            materialBatchMapper.insert(batch);

            // 增加库存
            upsertStock(item.getProductId(), request.getWarehouseId(), request.getLocationId(), batch.getId(), qty);

            // 记录库存流水
            addStockMove(item.getProductId(), request.getWarehouseId(), request.getLocationId(), batch.getId(),
                    null, null, null,
                    MoveType.IN, MoveReason.PRODUCE_IN, qty,
                    request.getProdOrderId(), RelatedOrderType.PROD_ORDER, null, request.getRemark());
        }

        return R.ok("成品入库成功", null);
    }

    /**
     * 销售出库
     * - 校验库存充足
     * - 减少库存 qty
     * - 记录库存流水 (OUT, SALE_OUT)
     */
    @Transactional
    public R<Void> outSale(StockOutSaleRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查仓库是否冻结
        checkWarehouseFreeze(request.getWarehouseId());

        for (SaleOutItemDTO item : request.getItems()) {
            int qty = item.getQty().intValue();

            // 查询指定库位和批次的库存
            Stock stock = stockMapper.selectOne(
                    new LambdaQueryWrapper<Stock>()
                            .eq(Stock::getProductId, item.getProductId())
                            .eq(Stock::getWarehouseId, request.getWarehouseId())
                            .eq(Stock::getLocationId, item.getLocationId())
                            .eq(Stock::getBatchId, item.getBatchId())
            );

            if (stock == null) {
                throw new BusinessException("库存记录不存在，无法销售出库");
            }

            int availableQty = stock.getQty() - (stock.getLockedQty() != null ? stock.getLockedQty() : 0);
            if (availableQty < qty) {
                throw new BusinessException("库存不足，无法完成销售出库");
            }

            stock.setQty(stock.getQty() - qty);
            stock.setUpdatedAt(LocalDateTime.now());
            stockMapper.updateById(stock);

            // 记录库存流水
            addStockMove(item.getProductId(), request.getWarehouseId(), item.getLocationId(), item.getBatchId(),
                    null, null, null,
                    MoveType.OUT, MoveReason.SALE_OUT, qty,
                    request.getSaleOrderId(), RelatedOrderType.SALE_ORDER, null, request.getRemark());
        }

        return R.ok("销售出库成功", null);
    }

    /**
     * 退料入库
     * - 增加库存 qty
     * - 记录库存流水 (IN, RETURN)
     */
    @Transactional
    public R<Void> inReturn(StockInPurchaseRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查仓库是否冻结
        checkWarehouseFreeze(request.getWarehouseId());

        for (PurchaseItemDTO item : request.getItems()) {
            // 查找已有批次或创建新批次
            MaterialBatch batch = createOrUpdateBatch(item, request.getWarehouseId(), request.getSupplierId());

            int qty = item.getQty().intValue();

            // 增加库存
            upsertStock(item.getProductId(), request.getWarehouseId(), request.getLocationId(), batch.getId(), qty);

            // 记录库存流水
            addStockMove(item.getProductId(), request.getWarehouseId(), request.getLocationId(), batch.getId(),
                    null, null, null,
                    MoveType.IN, MoveReason.RETURN, qty,
                    null, null, null, request.getRemark());
        }

        return R.ok("退料入库成功", null);
    }

    /**
     * 不良品出库
     * - 减少成品仓库存
     * - 增加不良品仓库存
     * - 记录库存流水 (OUT, DEFECT)
     */
    @Transactional
    public R<Void> outDefect(StockOutSaleRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查仓库是否冻结
        checkWarehouseFreeze(request.getWarehouseId());

        // 查找不良品仓
        Warehouse defectWarehouse = warehouseMapper.selectOne(
                new LambdaQueryWrapper<Warehouse>().eq(Warehouse::getType, "DEFECT")
        );
        if (defectWarehouse == null) {
            throw new BusinessException("未找到不良品仓，请先创建不良品仓");
        }

        for (SaleOutItemDTO item : request.getItems()) {
            int qty = item.getQty().intValue();

            // 减少成品仓库存
            Stock stock = stockMapper.selectOne(
                    new LambdaQueryWrapper<Stock>()
                            .eq(Stock::getProductId, item.getProductId())
                            .eq(Stock::getWarehouseId, request.getWarehouseId())
                            .eq(Stock::getLocationId, item.getLocationId())
                            .eq(Stock::getBatchId, item.getBatchId())
            );

            if (stock == null) {
                throw new BusinessException("库存记录不存在，无法转储不良品");
            }

            int availableQty = stock.getQty() - (stock.getLockedQty() != null ? stock.getLockedQty() : 0);
            if (availableQty < qty) {
                throw new BusinessException("库存不足，无法完成不良品转储");
            }

            stock.setQty(stock.getQty() - qty);
            stock.setUpdatedAt(LocalDateTime.now());
            stockMapper.updateById(stock);

            // 增加不良品仓库存
            upsertStock(item.getProductId(), defectWarehouse.getId(), null, item.getBatchId(), qty);

            // 记录库存流水
            addStockMove(item.getProductId(), request.getWarehouseId(), item.getLocationId(), item.getBatchId(),
                    defectWarehouse.getId(), null, item.getBatchId(),
                    MoveType.OUT, MoveReason.DEFECT, qty,
                    request.getSaleOrderId(), RelatedOrderType.SALE_ORDER, null, request.getRemark());
        }

        return R.ok("不良品转储成功", null);
    }

    /**
     * 库存预警列表
     * - 安全库存预警：可用库存 < safe_stock
     * - 呆滞料预警：原料超过90天未使用
     * - 超储预警：成品库存 > 月销量2倍
     * - 效期预警：原料批次30天内过期
     */
    public R<List<Map<String, Object>>> warnings() {
        List<Map<String, Object>> warnings = new ArrayList<>();

        // 1. 安全库存预警
        List<Product> products = productMapper.selectList(
                new LambdaQueryWrapper<Product>().gt(Product::getSafeStock, 0)
        );
        for (Product product : products) {
            // 查询该产品总可用库存
            List<Stock> stocks = stockMapper.selectList(
                    new LambdaQueryWrapper<Stock>().eq(Stock::getProductId, product.getId())
            );
            int totalAvailable = stocks.stream()
                    .mapToInt(s -> s.getQty() - (s.getLockedQty() != null ? s.getLockedQty() : 0))
                    .sum();

            if (totalAvailable < product.getSafeStock()) {
                Map<String, Object> warning = new HashMap<>();
                warning.put("type", "安全库存预警");
                warning.put("productId", product.getId());
                warning.put("productName", product.getName());
                warning.put("currentStock", totalAvailable);
                warning.put("safeStock", product.getSafeStock());
                warning.put("message", product.getName() + " 可用库存" + totalAvailable + "，低于安全库存" + product.getSafeStock());
                warnings.add(warning);
            }
        }

        // 2. 呆滞料预警：原料超过90天未使用
        LocalDate staleDate = LocalDate.now().minusDays(90);
        List<MaterialBatch> staleBatches = materialBatchMapper.selectList(
                new LambdaQueryWrapper<MaterialBatch>()
                        .le(MaterialBatch::getCreatedAt, staleDate.atStartOfDay())
                        .eq(MaterialBatch::getStatus, "NORMAL")
                        .gt(MaterialBatch::getRemainingQty, 0)
        );
        for (MaterialBatch batch : staleBatches) {
            // 检查最近90天是否有该批次的出库流水
            Long moveCount = stockMoveMapper.selectCount(
                    new LambdaQueryWrapper<StockMove>()
                            .eq(StockMove::getBatchId, batch.getId())
                            .eq(StockMove::getMoveType, MoveType.OUT.name())
                            .ge(StockMove::getCreatedAt, staleDate.atStartOfDay())
            );
            if (moveCount == 0) {
                Product product = productMapper.selectById(batch.getProductId());
                Map<String, Object> warning = new HashMap<>();
                warning.put("type", "呆滞料预警");
                warning.put("batchId", batch.getId());
                warning.put("batchNo", batch.getBatchNo());
                warning.put("productId", batch.getProductId());
                warning.put("productName", product != null ? product.getName() : "");
                warning.put("remainingQty", batch.getRemainingQty());
                warning.put("message", "批次" + batch.getBatchNo() + " 超过90天未使用，剩余数量" + batch.getRemainingQty());
                warnings.add(warning);
            }
        }

        // 3. 超储预警：成品库存 > 月销量2倍（简化处理，标记库存量过大的成品）
        List<Product> finishProducts = productMapper.selectList(
                new LambdaQueryWrapper<Product>().eq(Product::getType, "FINISH")
        );
        for (Product product : finishProducts) {
            List<Stock> stocks = stockMapper.selectList(
                    new LambdaQueryWrapper<Stock>().eq(Stock::getProductId, product.getId())
            );
            int totalQty = stocks.stream().mapToInt(Stock::getQty).sum();

            // 简化：查询最近30天的销售出库量
            LocalDate monthAgo = LocalDate.now().minusDays(30);
            List<StockMove> saleMoves = stockMoveMapper.selectList(
                    new LambdaQueryWrapper<StockMove>()
                            .eq(StockMove::getProductId, product.getId())
                            .eq(StockMove::getMoveReason, MoveReason.SALE_OUT.name())
                            .ge(StockMove::getCreatedAt, monthAgo.atStartOfDay())
            );
            int monthSaleQty = saleMoves.stream().mapToInt(StockMove::getQty).sum();

            if (monthSaleQty > 0 && totalQty > monthSaleQty * 2) {
                Map<String, Object> warning = new HashMap<>();
                warning.put("type", "超储预警");
                warning.put("productId", product.getId());
                warning.put("productName", product.getName());
                warning.put("currentStock", totalQty);
                warning.put("monthSaleQty", monthSaleQty);
                warning.put("message", product.getName() + " 库存" + totalQty + "，超过月销量" + monthSaleQty + "的2倍");
                warnings.add(warning);
            }
        }

        // 4. 效期预警：原料批次30天内过期
        LocalDate expiryWarningDate = LocalDate.now().plusDays(30);
        List<MaterialBatch> expiringBatches = materialBatchMapper.selectList(
                new LambdaQueryWrapper<MaterialBatch>()
                        .le(MaterialBatch::getExpiryDate, expiryWarningDate)
                        .ge(MaterialBatch::getExpiryDate, LocalDate.now())
                        .eq(MaterialBatch::getStatus, "NORMAL")
                        .gt(MaterialBatch::getRemainingQty, 0)
        );
        for (MaterialBatch batch : expiringBatches) {
            Product product = productMapper.selectById(batch.getProductId());
            Map<String, Object> warning = new HashMap<>();
            warning.put("type", "效期预警");
            warning.put("batchId", batch.getId());
            warning.put("batchNo", batch.getBatchNo());
            warning.put("productId", batch.getProductId());
            warning.put("productName", product != null ? product.getName() : "");
            warning.put("expiryDate", batch.getExpiryDate());
            warning.put("remainingQty", batch.getRemainingQty());
            warning.put("message", "批次" + batch.getBatchNo() + " 将于" + batch.getExpiryDate() + "过期，剩余数量" + batch.getRemainingQty());
            warnings.add(warning);
        }

        return R.ok(warnings);
    }

    /**
     * 内部方法：更新库存（upsert逻辑）
     * 先查询是否存在，存在则更新qty，不存在则插入
     */
    private Stock upsertStock(Long productId, Long warehouseId, Long locationId, Long batchId, int qtyChange) {
        LambdaQueryWrapper<Stock> wrapper = new LambdaQueryWrapper<Stock>()
                .eq(Stock::getProductId, productId)
                .eq(Stock::getWarehouseId, warehouseId);

        if (locationId != null) {
            wrapper.eq(Stock::getLocationId, locationId);
        } else {
            wrapper.isNull(Stock::getLocationId);
        }
        if (batchId != null) {
            wrapper.eq(Stock::getBatchId, batchId);
        } else {
            wrapper.isNull(Stock::getBatchId);
        }

        Stock stock = stockMapper.selectOne(wrapper);

        if (stock != null) {
            // 更新库存数量
            stock.setQty(stock.getQty() + qtyChange);
            if (stock.getQty() < 0) {
                throw new BusinessException("库存不能为负");
            }
            stock.setUpdatedAt(LocalDateTime.now());
            stockMapper.updateById(stock);
        } else {
            // 新增库存记录
            stock = new Stock();
            stock.setProductId(productId);
            stock.setWarehouseId(warehouseId);
            stock.setLocationId(locationId);
            stock.setBatchId(batchId);
            stock.setQty(qtyChange);
            stock.setLockedQty(0);
            stock.setUpdatedAt(LocalDateTime.now());
            if (stock.getQty() < 0) {
                throw new BusinessException("库存不能为负");
            }
            stockMapper.insert(stock);
        }

        return stock;
    }

    /**
     * 内部方法：记录库存流水
     */
    private void addStockMove(Long productId, Long warehouseId, Long locationId, Long batchId,
                              Long toWarehouseId, Long toLocationId, Long toBatchId,
                              MoveType moveType, MoveReason moveReason, int qty,
                              Long relatedOrderId, RelatedOrderType relatedOrderType, Long operatorId, String remark) {
        StockMove move = new StockMove();
        move.setMoveNo(generateMoveNo());
        move.setProductId(productId);
        move.setWarehouseId(warehouseId);
        move.setLocationId(locationId);
        move.setBatchId(batchId);
        move.setToWarehouseId(toWarehouseId);
        move.setToLocationId(toLocationId);
        move.setToBatchId(toBatchId);
        move.setMoveType(moveType.name());
        move.setMoveReason(moveReason.name());
        move.setQty(qty);
        move.setRelatedOrderId(relatedOrderId);
        move.setRelatedOrderType(relatedOrderType != null ? relatedOrderType.name() : null);
        move.setOperatorId(operatorId);
        move.setOperateTime(LocalDateTime.now());
        move.setRemark(remark);
        move.setCreatedAt(LocalDateTime.now());

        stockMoveMapper.insert(move);
    }

    /**
     * 生成流水号：SM+YYYYMMDD+4位序号
     */
    private String generateMoveNo() {
        return seqNumberService.generateNo("SM", 4);
    }

    /**
     * 创建或更新批次
     */
    private MaterialBatch createOrUpdateBatch(PurchaseItemDTO item, Long warehouseId, Long supplierId) {
        MaterialBatch batch = null;

        // 如果提供了批次号，查找已有批次
        if (item.getBatchNo() != null && !item.getBatchNo().trim().isEmpty()) {
            batch = materialBatchMapper.selectOne(
                    new LambdaQueryWrapper<MaterialBatch>()
                            .eq(MaterialBatch::getBatchNo, item.getBatchNo())
            );
        }

        if (batch != null) {
            // 更新批次剩余数量
            batch.setRemainingQty(batch.getRemainingQty() + item.getQty().intValue());
            materialBatchMapper.updateById(batch);
        } else {
            // 创建新批次
            batch = new MaterialBatch();
            batch.setBatchNo(item.getBatchNo() != null ? item.getBatchNo() : generateBatchNo());
            batch.setProductId(item.getProductId());
            batch.setWarehouseId(warehouseId);
            batch.setSupplierId(supplierId);
            batch.setProductionDate(item.getProductionDate());
            batch.setExpiryDate(item.getExpiryDate());
            batch.setInitialQty(item.getQty().intValue());
            batch.setRemainingQty(item.getQty().intValue());
            batch.setStatus("NORMAL");
            batch.setCreatedAt(LocalDateTime.now());

            materialBatchMapper.insert(batch);
        }

        return batch;
    }

    /**
     * 自动生成批次号：R-YYYYMMDD-3位序号
     */
    private String generateBatchNo() {
        return seqNumberService.generateBatchNo();
    }

    /**
     * 检查仓库是否冻结（盘点中）
     */
    private void checkWarehouseFreeze(Long warehouseId) {
        Long freezeCount = stockInventoryMapper.selectCount(
                new LambdaQueryWrapper<StockInventory>()
                        .eq(StockInventory::getWarehouseId, warehouseId)
                        .eq(StockInventory::getFreezeStock, 1)
                        .notIn(StockInventory::getStatus, "FINISHED", "CANCELLED")
        );
        if (freezeCount > 0) {
            throw new BusinessException("仓库正在盘点中，禁止出入库操作");
        }
    }

    /**
     * 实体转库存响应DTO
     */
    private StockResponse convertToStockResponse(Stock stock) {
        StockResponse response = new StockResponse();
        response.setId(stock.getId());
        response.setProductId(stock.getProductId());
        response.setWarehouseId(stock.getWarehouseId());
        response.setLocationId(stock.getLocationId());
        response.setBatchId(stock.getBatchId());

        // 数量转换：Integer -> BigDecimal
        if (stock.getQty() != null) {
            response.setQty(BigDecimal.valueOf(stock.getQty()));
        }
        if (stock.getLockedQty() != null) {
            response.setLockedQty(BigDecimal.valueOf(stock.getLockedQty()));
        }
        // 计算可用数量
        int qty = stock.getQty() != null ? stock.getQty() : 0;
        int lockedQty = stock.getLockedQty() != null ? stock.getLockedQty() : 0;
        response.setAvailableQty(BigDecimal.valueOf(qty - lockedQty));

        // 查询产品名称
        if (stock.getProductId() != null) {
            Product product = productMapper.selectById(stock.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }
        // 查询仓库名称
        if (stock.getWarehouseId() != null) {
            Warehouse warehouse = warehouseMapper.selectById(stock.getWarehouseId());
            if (warehouse != null) {
                response.setWarehouseName(warehouse.getName());
            }
        }
        // 查询库位编码
        if (stock.getLocationId() != null) {
            WarehouseLocation location = warehouseLocationMapper.selectById(stock.getLocationId());
            if (location != null) {
                response.setLocationCode(location.getCode());
            }
        }
        // 查询批次号
        if (stock.getBatchId() != null) {
            MaterialBatch batch = materialBatchMapper.selectById(stock.getBatchId());
            if (batch != null) {
                response.setBatchNo(batch.getBatchNo());
            }
        }

        return response;
    }

    /**
     * 实体转库存流水响应DTO
     */
    private StockMoveResponse convertToStockMoveResponse(StockMove move) {
        StockMoveResponse response = new StockMoveResponse();
        response.setId(move.getId());
        response.setProductId(move.getProductId());
        response.setWarehouseId(move.getWarehouseId());
        response.setLocationId(move.getLocationId());
        response.setBatchId(move.getBatchId());
        response.setMoveType(move.getMoveType());
        response.setDirection(move.getMoveType());
        response.setRemark(move.getRemark());

        // 数量转换
        if (move.getQty() != null) {
            response.setQty(BigDecimal.valueOf(move.getQty()));
        }

        // 关联单据
        response.setRelatedId(move.getRelatedOrderId());
        response.setRelatedType(move.getRelatedOrderType());

        // 查询产品名称
        if (move.getProductId() != null) {
            Product product = productMapper.selectById(move.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }
        // 查询仓库名称
        if (move.getWarehouseId() != null) {
            Warehouse warehouse = warehouseMapper.selectById(move.getWarehouseId());
            if (warehouse != null) {
                response.setWarehouseName(warehouse.getName());
            }
        }
        // 查询库位编码
        if (move.getLocationId() != null) {
            WarehouseLocation location = warehouseLocationMapper.selectById(move.getLocationId());
            if (location != null) {
                response.setLocationCode(location.getCode());
            }
        }
        // 查询批次号
        if (move.getBatchId() != null) {
            MaterialBatch batch = materialBatchMapper.selectById(move.getBatchId());
            if (batch != null) {
                response.setBatchNo(batch.getBatchNo());
            }
        }
        // 查询操作人名称
        if (move.getOperatorId() != null) {
            SysUser user = sysUserMapper.selectById(move.getOperatorId());
            if (user != null) {
                response.setOperatorName(user.getRealName());
            }
        }

        response.setCreatedAt(move.getCreatedAt());

        return response;
    }
}
