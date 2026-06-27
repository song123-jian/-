package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.InventoryCountItemDTO;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.StockInventoryCountRequest;
import com.injectmes.dto.req.StockInventoryCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.StockInventoryResponse;
import com.injectmes.entity.*;
import com.injectmes.enums.InventoryStatus;
import com.injectmes.enums.InventoryType;
import com.injectmes.enums.MoveReason;
import com.injectmes.enums.MoveType;
import com.injectmes.enums.RelatedOrderType;
import com.injectmes.exception.BusinessException;
import com.injectmes.security.LoginUserDetails;
import com.injectmes.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 盘点服务
 */
@Service
public class StockInventoryService {

    @Autowired
    private StockInventoryMapper stockInventoryMapper;

    @Autowired
    private StockInventoryItemMapper stockInventoryItemMapper;

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

    /**
     * 分页查询盘点单列表
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<StockInventoryResponse>> list(PageRequest request) {
        Page<StockInventory> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<StockInventory> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索（盘点编号）
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w.like(StockInventory::getInventoryNo, keyword)
                    .or().like(StockInventory::getRemark, keyword));
        }

        if (request.getStatus() != null && !request.getStatus().trim().isEmpty()) {
            wrapper.eq(StockInventory::getStatus, request.getStatus().trim());
        }

        // 按创建时间降序
        wrapper.orderByDesc(StockInventory::getCreatedAt);

        Page<StockInventory> result = stockInventoryMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<StockInventoryResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<StockInventoryResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 创建盘点单 DRAFT
     */
    @Transactional
    public R<StockInventoryResponse> create(StockInventoryCreateRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        StockInventory inventory = new StockInventory();
        inventory.setInventoryNo(generateInventoryNo());
        inventory.setWarehouseId(request.getWarehouseId());
        inventory.setInventoryType(normalizeInventoryType(request.getInventoryType()));
        inventory.setStatus(InventoryStatus.DRAFT.name());
        inventory.setFreezeStock(0);
        inventory.setRemark(request.getRemark());
        inventory.setOperatorId(resolveOperatorId(request.getOperatorId()));
        inventory.setCreatedAt(LocalDateTime.now());

        stockInventoryMapper.insert(inventory);

        // 根据仓库现有库存生成盘点明细（账面数量）
        List<Stock> stocks = stockMapper.selectList(
                new LambdaQueryWrapper<Stock>()
                        .eq(Stock::getWarehouseId, request.getWarehouseId())
                        .gt(Stock::getQty, 0)
        );

        for (Stock stock : stocks) {
            StockInventoryItem item = new StockInventoryItem();
            item.setInventoryId(inventory.getId());
            item.setProductId(stock.getProductId());
            item.setLocationId(stock.getLocationId());
            item.setBatchId(stock.getBatchId());
            item.setBookQty(stock.getQty());
            item.setActualQty(null);
            item.setDiffQty(null);
            item.setDiffAmount(null);
            item.setReason(null);

            stockInventoryItemMapper.insert(item);
        }

        return R.ok("创建成功", convertToResponse(inventory));
    }

    /**
     * 开始盘点 DRAFT→COUNTING，冻结盘点区域库存
     */
    @Transactional
    public R<Void> start(Long id) {
        StockInventory inventory = stockInventoryMapper.selectById(id);
        if (inventory == null) {
            throw new BusinessException("盘点单不存在");
        }

        // 校验状态
        if (!InventoryStatus.DRAFT.name().equals(inventory.getStatus())) {
            throw new BusinessException("盘点单状态不是草稿，无法开始盘点");
        }

        // 冻结盘点区域库存
        inventory.setFreezeStock(1);
        inventory.setStatus(InventoryStatus.COUNTING.name());
        stockInventoryMapper.updateById(inventory);

        return R.ok("开始盘点成功", null);
    }

    /**
     * 录入实盘 COUNTING中
     */
    @Transactional
    public R<Void> count(Long id, StockInventoryCountRequest request) {
        StockInventory inventory = stockInventoryMapper.selectById(id);
        if (inventory == null) {
            throw new BusinessException("盘点单不存在");
        }

        // 校验状态
        if (!InventoryStatus.COUNTING.name().equals(inventory.getStatus())) {
            throw new BusinessException("盘点单状态不是盘点中，无法录入实盘");
        }

        // 更新盘点明细的实盘数量
        for (InventoryCountItemDTO itemDTO : request.getItems()) {
            // 查找对应的盘点明细
            StockInventoryItem item = stockInventoryItemMapper.selectOne(
                    new LambdaQueryWrapper<StockInventoryItem>()
                            .eq(StockInventoryItem::getInventoryId, id)
                            .eq(StockInventoryItem::getProductId, itemDTO.getProductId())
                            .eq(StockInventoryItem::getLocationId, itemDTO.getLocationId())
                            .eq(StockInventoryItem::getBatchId, itemDTO.getBatchId())
            );

            if (item == null) {
                // 如果没有对应的明细，创建一条
                item = new StockInventoryItem();
                item.setInventoryId(id);
                item.setProductId(itemDTO.getProductId());
                item.setLocationId(itemDTO.getLocationId());
                item.setBatchId(itemDTO.getBatchId());
                item.setBookQty(0);
            }

            item.setActualQty(itemDTO.getActualQty().intValue());
            item.setDiffQty(item.getActualQty() - (item.getBookQty() != null ? item.getBookQty() : 0));
            item.setReason(itemDTO.getReason());

            if (item.getId() != null) {
                stockInventoryItemMapper.updateById(item);
            } else {
                stockInventoryItemMapper.insert(item);
            }
        }

        inventory.setOperatorId(resolveOperatorId(request.getOperatorId()));
        stockInventoryMapper.updateById(inventory);

        return R.ok("录入实盘成功", null);
    }

    /**
     * 提交审核 COUNTING→PENDING_APPROVE
     */
    @Transactional
    public R<Void> submit(Long id) {
        StockInventory inventory = stockInventoryMapper.selectById(id);
        if (inventory == null) {
            throw new BusinessException("盘点单不存在");
        }

        // 校验状态
        if (!InventoryStatus.COUNTING.name().equals(inventory.getStatus())) {
            throw new BusinessException("盘点单状态不是盘点中，无法提交审核");
        }

        inventory.setStatus(InventoryStatus.PENDING_APPROVE.name());
        inventory.setApproverId(resolveCurrentUserId());
        stockInventoryMapper.updateById(inventory);

        return R.ok("提交审核成功", null);
    }

    /**
     * 审核通过 PENDING_APPROVE→FINISHED，调整库存
     */
    @Transactional
    public R<Void> approve(Long id) {
        StockInventory inventory = stockInventoryMapper.selectById(id);
        if (inventory == null) {
            throw new BusinessException("盘点单不存在");
        }

        // 校验状态
        if (!InventoryStatus.PENDING_APPROVE.name().equals(inventory.getStatus())) {
            throw new BusinessException("盘点单状态不是待审批，无法审核通过");
        }

        // 查询盘点明细
        List<StockInventoryItem> items = stockInventoryItemMapper.selectList(
                new LambdaQueryWrapper<StockInventoryItem>().eq(StockInventoryItem::getInventoryId, id)
        );

        // 根据差异调整库存
        for (StockInventoryItem item : items) {
            if (item.getDiffQty() == null || item.getDiffQty() == 0) {
                continue;
            }

            int diffQty = item.getDiffQty();

            // 更新库存
            Stock stock = stockMapper.selectOne(
                    new LambdaQueryWrapper<Stock>()
                            .eq(Stock::getProductId, item.getProductId())
                            .eq(Stock::getWarehouseId, inventory.getWarehouseId())
                            .eq(item.getLocationId() != null, Stock::getLocationId, item.getLocationId())
                            .eq(item.getBatchId() != null, Stock::getBatchId, item.getBatchId())
            );

            if (stock != null) {
                stock.setQty(stock.getQty() + diffQty);
                if (stock.getQty() < 0) {
                    stock.setQty(0);
                }
                stock.setUpdatedAt(LocalDateTime.now());
                stockMapper.updateById(stock);
            } else if (diffQty > 0) {
                // 库存记录不存在但有盘盈，新增库存记录
                stock = new Stock();
                stock.setProductId(item.getProductId());
                stock.setWarehouseId(inventory.getWarehouseId());
                stock.setLocationId(item.getLocationId());
                stock.setBatchId(item.getBatchId());
                stock.setQty(diffQty);
                stock.setLockedQty(0);
                stock.setUpdatedAt(LocalDateTime.now());
                stockMapper.insert(stock);
            }

            // 记录库存流水（盘点调整）
            addStockMove(item.getProductId(), inventory.getWarehouseId(), item.getLocationId(), item.getBatchId(),
                    null, null, null,
                    diffQty > 0 ? MoveType.IN : MoveType.OUT,
                    MoveReason.INVENTORY_ADJ,
                    Math.abs(diffQty),
                    inventory.getId(), RelatedOrderType.INVENTORY,
                    inventory.getOperatorId(), "盘点调整");
        }

        // 解冻库存
        inventory.setFreezeStock(0);
        inventory.setStatus(InventoryStatus.FINISHED.name());
        inventory.setApproverId(null);
        stockInventoryMapper.updateById(inventory);

        return R.ok("审核通过成功", null);
    }

    /**
     * 驳回 PENDING_APPROVE→COUNTING
     */
    @Transactional
    public R<Void> reject(Long id) {
        StockInventory inventory = stockInventoryMapper.selectById(id);
        if (inventory == null) {
            throw new BusinessException("盘点单不存在");
        }

        // 校验状态
        if (!InventoryStatus.PENDING_APPROVE.name().equals(inventory.getStatus())) {
            throw new BusinessException("盘点单状态不是待审批，无法驳回");
        }

        inventory.setStatus(InventoryStatus.COUNTING.name());
        stockInventoryMapper.updateById(inventory);

        return R.ok("驳回成功", null);
    }

    /**
     * 移动端快速实盘并审核通过
     */
    @Transactional
    public R<Void> quickMobileCheck(Long warehouseId, Long locationId, Long productId, Integer actualQuantity, String reason) {
        Warehouse warehouse = warehouseMapper.selectById(warehouseId);
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }
        WarehouseLocation location = warehouseLocationMapper.selectById(locationId);
        if (location == null) {
            throw new BusinessException("库位不存在");
        }
        Product product = productMapper.selectById(productId);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }

        List<Stock> stocks = stockMapper.selectList(
                new LambdaQueryWrapper<Stock>()
                        .eq(Stock::getWarehouseId, warehouseId)
                        .eq(Stock::getLocationId, locationId)
                        .eq(Stock::getProductId, productId)
        );

        StockInventoryCreateRequest createRequest = new StockInventoryCreateRequest();
        createRequest.setWarehouseId(warehouseId);
        createRequest.setInventoryType("PARTIAL");
        createRequest.setRemark("移动端实盘：" + product.getName() + "@" + location.getCode() + "，实盘数量=" + actualQuantity);
        createRequest.setOperatorId(resolveCurrentUserId());
        R<StockInventoryResponse> createResult = create(createRequest);
        if (createResult.getCode() != 200 || createResult.getData() == null) {
            throw new BusinessException("创建盘点单失败");
        }

        StockInventoryResponse inventory = createResult.getData();
        InventoryCountItemDTO countItem = new InventoryCountItemDTO();
        countItem.setProductId(productId);
        countItem.setLocationId(locationId);
        countItem.setBatchId(resolveBatchId(stocks));
        countItem.setActualQty(BigDecimal.valueOf(actualQuantity));
        countItem.setReason(reason != null && !reason.trim().isEmpty() ? reason : "移动端盘点");

        StockInventoryCountRequest countRequest = new StockInventoryCountRequest();
        countRequest.setItems(List.of(countItem));
        countRequest.setOperatorId(resolveCurrentUserId());

        start(inventory.getId());
        count(inventory.getId(), countRequest);
        submit(inventory.getId());
        approve(inventory.getId());

        return R.ok("盘点提交成功", null);
    }

    /**
     * 生成盘点单号：IV+YYYYMMDD+3位序号
     */
    private String generateInventoryNo() {
        return seqNumberService.generateNo("IV", 3);
    }

    /**
     * 盘点类型标准化
     */
    private String normalizeInventoryType(String inventoryType) {
        if (inventoryType == null || inventoryType.trim().isEmpty()) {
            return InventoryType.FULL.name();
        }
        String value = inventoryType.trim().toUpperCase();
        for (InventoryType type : InventoryType.values()) {
            if (type.name().equals(value)) {
                return type.name();
            }
        }
        return InventoryType.FULL.name();
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
     * 实体转响应DTO
     */
    private StockInventoryResponse convertToResponse(StockInventory inventory) {
        StockInventoryResponse response = new StockInventoryResponse();
        response.setId(inventory.getId());
        response.setInventoryNo(inventory.getInventoryNo());
        response.setWarehouseId(inventory.getWarehouseId());
        response.setInventoryType(inventory.getInventoryType());
        response.setStatus(inventory.getStatus());
        response.setRemark(inventory.getRemark());
        response.setCreatedAt(inventory.getCreatedAt());
        response.setUpdatedAt(inventory.getCreatedAt());

        // 查询仓库名称
        if (inventory.getWarehouseId() != null) {
            Warehouse warehouse = warehouseMapper.selectById(inventory.getWarehouseId());
            if (warehouse != null) {
                response.setWarehouseName(warehouse.getName());
            }
        }
        // 查询创建人名称
        if (inventory.getOperatorId() != null) {
            SysUser user = sysUserMapper.selectById(inventory.getOperatorId());
            if (user != null) {
                response.setCreatorName(user.getRealName());
            }
        }

        // 查询盘点明细
        List<StockInventoryItem> items = stockInventoryItemMapper.selectList(
                new LambdaQueryWrapper<StockInventoryItem>().eq(StockInventoryItem::getInventoryId, inventory.getId())
        );

        List<StockInventoryResponse.StockInventoryItemResponse> itemResponses = items.stream()
                .map(this::convertToItemResponse)
                .collect(Collectors.toList());

        response.setItems(itemResponses);

        return response;
    }

    private Long resolveOperatorId(Long operatorId) {
        if (operatorId != null) {
            return operatorId;
        }
        return resolveCurrentUserId();
    }

    private Long resolveCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUserDetails userDetails) {
            return userDetails.getUserId();
        }
        return null;
    }

    private Long resolveBatchId(List<Stock> stocks) {
        return stocks.stream()
                .map(Stock::getBatchId)
                .filter(java.util.Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    /**
     * 盘点明细实体转响应DTO
     */
    private StockInventoryResponse.StockInventoryItemResponse convertToItemResponse(StockInventoryItem item) {
        StockInventoryResponse.StockInventoryItemResponse response = new StockInventoryResponse.StockInventoryItemResponse();
        response.setId(item.getId());
        response.setProductId(item.getProductId());
        response.setLocationId(item.getLocationId());
        response.setBatchId(item.getBatchId());
        response.setReason(item.getReason());

        // 数量转换：Integer -> BigDecimal
        if (item.getBookQty() != null) {
            response.setBookQty(BigDecimal.valueOf(item.getBookQty()));
        }
        if (item.getActualQty() != null) {
            response.setActualQty(BigDecimal.valueOf(item.getActualQty()));
        }
        if (item.getDiffQty() != null) {
            response.setDiffQty(BigDecimal.valueOf(item.getDiffQty()));
        }

        // 查询产品名称
        if (item.getProductId() != null) {
            Product product = productMapper.selectById(item.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }
        // 查询库位编码
        if (item.getLocationId() != null) {
            WarehouseLocation location = warehouseLocationMapper.selectById(item.getLocationId());
            if (location != null) {
                response.setLocationCode(location.getCode());
            }
        }
        // 查询批次号
        if (item.getBatchId() != null) {
            MaterialBatch batch = materialBatchMapper.selectById(item.getBatchId());
            if (batch != null) {
                response.setBatchNo(batch.getBatchNo());
            }
        }

        return response;
    }
}
