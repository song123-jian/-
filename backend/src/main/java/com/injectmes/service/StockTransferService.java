package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.StockTransferCreateRequest;
import com.injectmes.dto.req.TransferItemDTO;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.StockTransferResponse;
import com.injectmes.entity.*;
import com.injectmes.enums.MoveReason;
import com.injectmes.enums.MoveType;
import com.injectmes.enums.RelatedOrderType;
import com.injectmes.enums.TransferStatus;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 调拨服务
 */
@Service
public class StockTransferService {

    @Autowired
    private StockTransferMapper stockTransferMapper;

    @Autowired
    private StockTransferItemMapper stockTransferItemMapper;

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private StockMoveMapper stockMoveMapper;

    @Autowired
    private WarehouseMapper warehouseMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    @Autowired
    private WarehouseLocationMapper warehouseLocationMapper;

    @Autowired
    private MaterialBatchMapper materialBatchMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private StockInventoryMapper stockInventoryMapper;

    /**
     * 分页查询调拨单列表
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<StockTransferResponse>> list(PageRequest request) {
        Page<StockTransfer> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<StockTransfer> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索（调拨单号）
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(StockTransfer::getTransferNo, keyword);
        }

        // 按创建时间降序
        wrapper.orderByDesc(StockTransfer::getCreatedAt);

        Page<StockTransfer> result = stockTransferMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<StockTransferResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<StockTransferResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 创建调拨单（DRAFT状态，校验调出仓和调入仓不能相同）
     */
    @Transactional
    public R<StockTransferResponse> create(StockTransferCreateRequest request) {
        // 校验调出仓和调入仓不能相同
        if (request.getFromWarehouseId().equals(request.getToWarehouseId())) {
            throw new BusinessException("调出仓和调入仓不能相同");
        }

        // 校验仓库是否存在
        Warehouse fromWarehouse = warehouseMapper.selectById(request.getFromWarehouseId());
        if (fromWarehouse == null) {
            throw new BusinessException("调出仓库不存在");
        }
        Warehouse toWarehouse = warehouseMapper.selectById(request.getToWarehouseId());
        if (toWarehouse == null) {
            throw new BusinessException("调入仓库不存在");
        }

        // 创建调拨单
        StockTransfer transfer = new StockTransfer();
        transfer.setTransferNo(generateTransferNo());
        transfer.setFromWarehouseId(request.getFromWarehouseId());
        transfer.setToWarehouseId(request.getToWarehouseId());
        transfer.setStatus(TransferStatus.DRAFT.name());
        transfer.setRemark(request.getRemark());
        transfer.setCreatedAt(LocalDateTime.now());

        stockTransferMapper.insert(transfer);

        // 创建调拨明细
        for (TransferItemDTO itemDTO : request.getItems()) {
            StockTransferItem item = new StockTransferItem();
            item.setTransferId(transfer.getId());
            item.setProductId(itemDTO.getProductId());
            item.setFromLocationId(itemDTO.getFromLocationId());
            item.setToLocationId(itemDTO.getToLocationId());
            item.setFromBatchId(itemDTO.getFromBatchId());
            item.setQty(itemDTO.getQty().intValue());
            item.setReceivedQty(0);
            item.setRemark(null);

            stockTransferItemMapper.insert(item);
        }

        return R.ok("创建成功", convertToResponse(transfer));
    }

    /**
     * 确认发货 DRAFT→SHIPPED，扣减调出仓库存
     */
    @Transactional
    public R<Void> ship(Long id) {
        StockTransfer transfer = stockTransferMapper.selectById(id);
        if (transfer == null) {
            throw new BusinessException("调拨单不存在");
        }

        // 校验状态
        if (!TransferStatus.DRAFT.name().equals(transfer.getStatus())) {
            throw new BusinessException("调拨单状态不是草稿，无法发货");
        }

        // 检查调出仓是否冻结
        checkWarehouseFreeze(transfer.getFromWarehouseId());

        // 查询调拨明细
        List<StockTransferItem> items = stockTransferItemMapper.selectList(
                new LambdaQueryWrapper<StockTransferItem>().eq(StockTransferItem::getTransferId, id)
        );

        // 扣减调出仓库存
        for (StockTransferItem item : items) {
            Stock stock = stockMapper.selectOne(
                    new LambdaQueryWrapper<Stock>()
                            .eq(Stock::getProductId, item.getProductId())
                            .eq(Stock::getWarehouseId, transfer.getFromWarehouseId())
                            .eq(Stock::getLocationId, item.getFromLocationId())
                            .eq(Stock::getBatchId, item.getFromBatchId())
            );

            if (stock == null) {
                throw new BusinessException("调出仓库存不存在");
            }

            int availableQty = stock.getQty() - (stock.getLockedQty() != null ? stock.getLockedQty() : 0);
            if (availableQty < item.getQty()) {
                throw new BusinessException("调出仓库存不足，无法发货");
            }

            stock.setQty(stock.getQty() - item.getQty());
            stock.setUpdatedAt(LocalDateTime.now());
            stockMapper.updateById(stock);

            // 记录库存流水
            addStockMove(item.getProductId(), transfer.getFromWarehouseId(), item.getFromLocationId(), item.getFromBatchId(),
                    transfer.getToWarehouseId(), item.getToLocationId(), null,
                    MoveType.OUT, MoveReason.TRANSFER, item.getQty(),
                    transfer.getId(), RelatedOrderType.TRANSFER, transfer.getOperatorId(), "调拨发货");
        }

        // 更新状态
        transfer.setStatus(TransferStatus.SHIPPED.name());
        stockTransferMapper.updateById(transfer);

        return R.ok("发货成功", null);
    }

    /**
     * 确认收货 SHIPPED→RECEIVED，增加调入仓库存
     */
    @Transactional
    public R<Void> receive(Long id) {
        StockTransfer transfer = stockTransferMapper.selectById(id);
        if (transfer == null) {
            throw new BusinessException("调拨单不存在");
        }

        // 校验状态
        if (!TransferStatus.SHIPPED.name().equals(transfer.getStatus())) {
            throw new BusinessException("调拨单状态不是已发货，无法收货");
        }

        // 检查调入仓是否冻结
        checkWarehouseFreeze(transfer.getToWarehouseId());

        // 查询调拨明细
        List<StockTransferItem> items = stockTransferItemMapper.selectList(
                new LambdaQueryWrapper<StockTransferItem>().eq(StockTransferItem::getTransferId, id)
        );

        // 增加调入仓库存
        for (StockTransferItem item : items) {
            // upsert库存
            upsertStock(item.getProductId(), transfer.getToWarehouseId(), item.getToLocationId(), item.getFromBatchId(), item.getQty());

            // 更新明细的实收数量
            item.setReceivedQty(item.getQty());
            stockTransferItemMapper.updateById(item);

            // 记录库存流水
            addStockMove(item.getProductId(), transfer.getToWarehouseId(), item.getToLocationId(), item.getFromBatchId(),
                    null, null, null,
                    MoveType.IN, MoveReason.TRANSFER, item.getQty(),
                    transfer.getId(), RelatedOrderType.TRANSFER, transfer.getOperatorId(), "调拨收货");
        }

        // 更新状态
        transfer.setStatus(TransferStatus.RECEIVED.name());
        transfer.setReceiveTime(LocalDateTime.now());
        stockTransferMapper.updateById(transfer);

        return R.ok("收货成功", null);
    }

    /**
     * 关闭 RECEIVED→CLOSED
     */
    @Transactional
    public R<Void> close(Long id) {
        StockTransfer transfer = stockTransferMapper.selectById(id);
        if (transfer == null) {
            throw new BusinessException("调拨单不存在");
        }

        // 校验状态
        if (!TransferStatus.RECEIVED.name().equals(transfer.getStatus())) {
            throw new BusinessException("调拨单状态不是已收货，无法关闭");
        }

        transfer.setStatus(TransferStatus.CLOSED.name());
        stockTransferMapper.updateById(transfer);

        return R.ok("关闭成功", null);
    }

    /**
     * 生成调拨单号：TR+YYYYMMDD+3位序号
     */
    private String generateTransferNo() {
        return seqNumberService.generateNo("TR", 3);
    }

    /**
     * 更新库存（upsert逻辑）
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
            stock.setQty(stock.getQty() + qtyChange);
            stock.setUpdatedAt(LocalDateTime.now());
            stockMapper.updateById(stock);
        } else {
            stock = new Stock();
            stock.setProductId(productId);
            stock.setWarehouseId(warehouseId);
            stock.setLocationId(locationId);
            stock.setBatchId(batchId);
            stock.setQty(qtyChange);
            stock.setLockedQty(0);
            stock.setUpdatedAt(LocalDateTime.now());
            stockMapper.insert(stock);
        }

        return stock;
    }

    /**
     * 记录库存流水
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
            throw new BusinessException("仓库正在盘点中，禁止操作");
        }
    }

    /**
     * 实体转响应DTO
     */
    private StockTransferResponse convertToResponse(StockTransfer transfer) {
        StockTransferResponse response = new StockTransferResponse();
        response.setId(transfer.getId());
        response.setTransferNo(transfer.getTransferNo());
        response.setFromWarehouseId(transfer.getFromWarehouseId());
        response.setToWarehouseId(transfer.getToWarehouseId());
        response.setStatus(transfer.getStatus());
        response.setRemark(transfer.getRemark());
        response.setCreatedAt(transfer.getCreatedAt());

        // 查询源仓库名称
        if (transfer.getFromWarehouseId() != null) {
            Warehouse fromWarehouse = warehouseMapper.selectById(transfer.getFromWarehouseId());
            if (fromWarehouse != null) {
                response.setFromWarehouseName(fromWarehouse.getName());
            }
        }
        // 查询目标仓库名称
        if (transfer.getToWarehouseId() != null) {
            Warehouse toWarehouse = warehouseMapper.selectById(transfer.getToWarehouseId());
            if (toWarehouse != null) {
                response.setToWarehouseName(toWarehouse.getName());
            }
        }
        // 查询创建人名称
        if (transfer.getOperatorId() != null) {
            SysUser user = sysUserMapper.selectById(transfer.getOperatorId());
            if (user != null) {
                response.setCreatorName(user.getRealName());
            }
        }

        // 查询调拨明细
        List<StockTransferItem> items = stockTransferItemMapper.selectList(
                new LambdaQueryWrapper<StockTransferItem>().eq(StockTransferItem::getTransferId, transfer.getId())
        );

        List<StockTransferResponse.StockTransferItemResponse> itemResponses = items.stream()
                .map(this::convertToItemResponse)
                .collect(Collectors.toList());

        response.setItems(itemResponses);

        return response;
    }

    /**
     * 调拨明细实体转响应DTO
     */
    private StockTransferResponse.StockTransferItemResponse convertToItemResponse(StockTransferItem item) {
        StockTransferResponse.StockTransferItemResponse response = new StockTransferResponse.StockTransferItemResponse();
        response.setId(item.getId());
        response.setProductId(item.getProductId());
        response.setFromLocationId(item.getFromLocationId());
        response.setToLocationId(item.getToLocationId());
        response.setFromBatchId(item.getFromBatchId());
        response.setQty(BigDecimal.valueOf(item.getQty()));

        // 查询产品名称
        if (item.getProductId() != null) {
            Product product = productMapper.selectById(item.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }
        // 查询源库位编码
        if (item.getFromLocationId() != null) {
            WarehouseLocation location = warehouseLocationMapper.selectById(item.getFromLocationId());
            if (location != null) {
                response.setFromLocationCode(location.getCode());
            }
        }
        // 查询目标库位编码
        if (item.getToLocationId() != null) {
            WarehouseLocation location = warehouseLocationMapper.selectById(item.getToLocationId());
            if (location != null) {
                response.setToLocationCode(location.getCode());
            }
        }
        // 查询源批次号
        if (item.getFromBatchId() != null) {
            MaterialBatch batch = materialBatchMapper.selectById(item.getFromBatchId());
            if (batch != null) {
                response.setFromBatchNo(batch.getBatchNo());
            }
        }

        return response;
    }
}
