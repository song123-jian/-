package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.DeliveryCreateRequest;
import com.injectmes.dto.req.DeliveryItemDTO;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.DeliveryResponse;
import com.injectmes.entity.*;
import com.injectmes.enums.DeliveryStatus;
import com.injectmes.enums.MoveReason;
import com.injectmes.enums.MoveType;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.*;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 发货服务
 */
@Service
public class DeliveryService {

    @Autowired
    private DeliveryOrderMapper deliveryOrderMapper;

    @Autowired
    private DeliveryOrderItemMapper deliveryOrderItemMapper;

    @Autowired
    private SaleOrderMapper saleOrderMapper;

    @Autowired
    private SaleOrderItemMapper saleOrderItemMapper;

    @Autowired
    private CustomerMapper customerMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private StockMoveMapper stockMoveMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    @Autowired
    private WarehouseMapper warehouseMapper;

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private SysConfigMapper sysConfigMapper;

    @Autowired
    private MaterialBatchMapper materialBatchMapper;

    /**
     * 创建发货单（PENDING状态）
     * - 自动生成发货单号 DO+YYYYMMDD+3位序号
     * - 校验发货数量不超过订单未发货数量
     */
    @Transactional
    public R<DeliveryResponse> create(DeliveryCreateRequest request) {
        // 校验销售订单存在
        SaleOrder saleOrder = saleOrderMapper.selectById(request.getSaleOrderId());
        if (saleOrder == null) {
            throw new BusinessException("销售订单不存在");
        }

        // 自动生成发货单号 DO+YYYYMMDD+3位序号
        String deliveryNo = generateDeliveryNo();

        DeliveryOrder deliveryOrder = new DeliveryOrder();
        deliveryOrder.setDeliveryNo(deliveryNo);
        deliveryOrder.setSaleOrderId(request.getSaleOrderId());
        deliveryOrder.setCustomerId(saleOrder.getCustomerId());
        deliveryOrder.setDeliveryDate(request.getDeliveryDate());
        deliveryOrder.setLogisticsCompany(request.getLogisticsCompany());
        deliveryOrder.setTrackingNo(request.getTrackingNo());
        deliveryOrder.setStatus(DeliveryStatus.PENDING.name());
        deliveryOrder.setRemark(request.getRemark());
        deliveryOrder.setCreatedAt(LocalDateTime.now());

        // 计算总数量并校验发货数量
        int totalQty = 0;
        for (DeliveryItemDTO itemDTO : request.getItems()) {
            // 校验发货数量不超过订单未发货数量
            SaleOrderItem saleOrderItem = saleOrderItemMapper.selectById(itemDTO.getSaleOrderItemId());
            if (saleOrderItem == null) {
                throw new BusinessException("销售订单明细不存在，ID：" + itemDTO.getSaleOrderItemId());
            }

            int undeliveredQty = saleOrderItem.getQty()
                    - (saleOrderItem.getDeliveredQty() != null ? saleOrderItem.getDeliveredQty() : 0);
            if (itemDTO.getQty() > undeliveredQty) {
                throw new BusinessException("发货数量超过订单未发货数量，订单明细ID："
                        + itemDTO.getSaleOrderItemId() + "，未发货数量：" + undeliveredQty);
            }

            totalQty += itemDTO.getQty();
        }

        deliveryOrder.setTotalQty(totalQty);
        deliveryOrderMapper.insert(deliveryOrder);

        // 保存发货明细
        for (DeliveryItemDTO itemDTO : request.getItems()) {
            DeliveryOrderItem item = new DeliveryOrderItem();
            item.setDeliveryOrderId(deliveryOrder.getId());
            item.setSaleOrderItemId(itemDTO.getSaleOrderItemId());
            item.setProductId(itemDTO.getProductId());
            item.setQty(itemDTO.getQty());
            deliveryOrderItemMapper.insert(item);
        }

        return R.ok(convertToResponse(deliveryOrder));
    }

    /**
     * 发货单列表
     */
    public R<PageResponse<DeliveryResponse>> list(PageRequest request) {
        Page<DeliveryOrder> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<DeliveryOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByDesc(DeliveryOrder::getCreatedAt);
        Page<DeliveryOrder> result = deliveryOrderMapper.selectPage(page, wrapper);

        List<DeliveryResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<DeliveryResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());
        return R.ok(pageResponse);
    }

    /**
     * 确认发货 PENDING→SHIPPED
     * - 更新销售订单明细的delivered_qty
     * - 触发销售出库（调用StockService）
     */
    @Transactional
    public R<Void> ship(Long id) {
        DeliveryOrder deliveryOrder = deliveryOrderMapper.selectById(id);
        if (deliveryOrder == null) {
            throw new BusinessException("发货单不存在");
        }

        // 校验状态流转：仅PENDING可发货
        if (!DeliveryStatus.PENDING.name().equals(deliveryOrder.getStatus())) {
            throw new BusinessException("仅待发货状态的发货单可确认发货");
        }

        // 更新发货单状态
        deliveryOrder.setStatus(DeliveryStatus.SHIPPED.name());
        deliveryOrderMapper.updateById(deliveryOrder);

        // 更新销售订单明细的delivered_qty
        List<DeliveryOrderItem> items = deliveryOrderItemMapper.selectList(
                new LambdaQueryWrapper<DeliveryOrderItem>()
                        .eq(DeliveryOrderItem::getDeliveryOrderId, id)
        );

        // 默认从成品仓出库
        Warehouse finishWarehouse = getDefaultFinishWarehouse();
        if (finishWarehouse == null) {
            throw new BusinessException("未配置默认成品仓，无法发货");
        }

        for (DeliveryOrderItem item : items) {
            SaleOrderItem saleOrderItem = saleOrderItemMapper.selectById(item.getSaleOrderItemId());
            if (saleOrderItem != null) {
                int currentDelivered = saleOrderItem.getDeliveredQty() != null
                        ? saleOrderItem.getDeliveredQty() : 0;
                saleOrderItem.setDeliveredQty(currentDelivered + item.getQty());
                saleOrderItemMapper.updateById(saleOrderItem);
            }

            // 从成品仓扣减库存并记录流水
            deductStockAndRecordMove(item, finishWarehouse, deliveryOrder);
        }

        return R.ok("发货成功", null);
    }

    /**
     * 从成品仓扣减库存并记录销售出库流水
     */
    private void deductStockAndRecordMove(DeliveryOrderItem item, Warehouse warehouse, DeliveryOrder deliveryOrder) {
        int remainingQty = item.getQty();

        // FIFO：查询该产品在成品仓的可用库存，按批次生产日期升序
        List<Stock> stocks = stockMapper.selectList(
                new LambdaQueryWrapper<Stock>()
                        .eq(Stock::getProductId, item.getProductId())
                        .eq(Stock::getWarehouseId, warehouse.getId())
                        .gt(Stock::getQty, 0)
        );

        stocks.sort((a, b) -> {
            MaterialBatch batchA = a.getBatchId() != null ? materialBatchMapper.selectById(a.getBatchId()) : null;
            MaterialBatch batchB = b.getBatchId() != null ? materialBatchMapper.selectById(b.getBatchId()) : null;
            if (batchA == null || batchA.getProductionDate() == null) return 1;
            if (batchB == null || batchB.getProductionDate() == null) return -1;
            return batchA.getProductionDate().compareTo(batchB.getProductionDate());
        });

        for (Stock stock : stocks) {
            if (remainingQty <= 0) break;

            int availableQty = stock.getQty() - (stock.getLockedQty() != null ? stock.getLockedQty() : 0);
            if (availableQty <= 0) continue;

            int deductQty = Math.min(remainingQty, availableQty);
            stock.setQty(stock.getQty() - deductQty);
            stock.setUpdatedAt(LocalDateTime.now());
            stockMapper.updateById(stock);

            remainingQty -= deductQty;

            // 记录库存流水
            StockMove stockMove = new StockMove();
            stockMove.setMoveNo(generateMoveNo());
            stockMove.setProductId(item.getProductId());
            stockMove.setWarehouseId(warehouse.getId());
            stockMove.setLocationId(stock.getLocationId());
            stockMove.setBatchId(stock.getBatchId());
            stockMove.setMoveType(MoveType.OUT.name());
            stockMove.setMoveReason(MoveReason.SALE_OUT.name());
            stockMove.setQty(deductQty);
            stockMove.setRelatedOrderId(deliveryOrder.getSaleOrderId());
            stockMove.setRelatedOrderType("SALE_ORDER");
            stockMove.setOperateTime(LocalDateTime.now());
            stockMove.setCreatedAt(LocalDateTime.now());
            stockMoveMapper.insert(stockMove);
        }

        if (remainingQty > 0) {
            throw new BusinessException("成品仓库存不足，产品ID：" + item.getProductId()
                    + "，缺少数量：" + remainingQty);
        }
    }

    /**
     * 获取默认成品仓：优先读取 sys_config.default_finish_warehouse，否则取第一个 FINISH 类型仓库
     */
    private Warehouse getDefaultFinishWarehouse() {
        SysConfig config = sysConfigMapper.selectOne(
                new LambdaQueryWrapper<SysConfig>().eq(SysConfig::getConfigKey, "default_finish_warehouse")
        );
        Long warehouseId = null;
        if (config != null && config.getConfigValue() != null && !config.getConfigValue().trim().isEmpty()) {
            try {
                warehouseId = Long.valueOf(config.getConfigValue().trim());
            } catch (NumberFormatException ignored) {
            }
        }
        if (warehouseId != null) {
            Warehouse warehouse = warehouseMapper.selectById(warehouseId);
            if (warehouse != null) {
                return warehouse;
            }
        }
        return warehouseMapper.selectOne(
                new LambdaQueryWrapper<Warehouse>().eq(Warehouse::getType, "FINISH").last("LIMIT 1")
        );
    }

    /**
     * 生成库存流水号：SM+YYYYMMDD+4位序号
     */
    private String generateMoveNo() {
        return seqNumberService.generateNo("SM", 4);
    }

    /**
     * 确认签收 SHIPPED→RECEIVED
     */
    @Transactional
    public R<Void> receive(Long id) {
        DeliveryOrder deliveryOrder = deliveryOrderMapper.selectById(id);
        if (deliveryOrder == null) {
            throw new BusinessException("发货单不存在");
        }

        // 校验状态流转：仅SHIPPED可签收
        if (!DeliveryStatus.SHIPPED.name().equals(deliveryOrder.getStatus())) {
            throw new BusinessException("仅已发货状态的发货单可确认签收");
        }

        deliveryOrder.setStatus(DeliveryStatus.RECEIVED.name());
        deliveryOrderMapper.updateById(deliveryOrder);

        return R.ok("签收成功", null);
    }

    /**
     * 生成发货单号：DO+YYYYMMDD+3位序号（如DO20260617001）
     */
    @Transactional
    public R<DeliveryResponse> update(Long id, DeliveryCreateRequest request) {
        DeliveryOrder deliveryOrder = requireDeliveryOrder(id);
        BeanUtils.copyProperties(request, deliveryOrder);
        deliveryOrder.setId(id);
        deliveryOrderMapper.updateById(deliveryOrder);
        return R.ok("更新成功", convertToResponse(deliveryOrder));
    }

    @Transactional
    public R<Void> delete(Long id) {
        requireDeliveryOrder(id);
        deliveryOrderMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    private String generateDeliveryNo() {
        return seqNumberService.generateNo("DO", 3);
    }

    private DeliveryOrder requireDeliveryOrder(Long id) {
        DeliveryOrder deliveryOrder = deliveryOrderMapper.selectById(id);
        if (deliveryOrder == null) {
            throw new BusinessException("发货单不存在");
        }
        return deliveryOrder;
    }

    /**
     * 实体转响应DTO
     */
    private DeliveryResponse convertToResponse(DeliveryOrder deliveryOrder) {
        DeliveryResponse response = new DeliveryResponse();
        BeanUtils.copyProperties(deliveryOrder, response);

        // 查询客户名称
        if (deliveryOrder.getCustomerId() != null) {
            Customer customer = customerMapper.selectById(deliveryOrder.getCustomerId());
            if (customer != null) {
                response.setCustomerName(customer.getName());
            }
        }

        // 查询订单编号
        if (deliveryOrder.getSaleOrderId() != null) {
            SaleOrder saleOrder = saleOrderMapper.selectById(deliveryOrder.getSaleOrderId());
            if (saleOrder != null) {
                response.setOrderNo(saleOrder.getOrderNo());
            }
        }

        // 查询创建人名称
        if (deliveryOrder.getOperatorId() != null) {
            SysUser user = sysUserMapper.selectById(deliveryOrder.getOperatorId());
            if (user != null) {
                response.setCreatorName(user.getRealName());
            }
        }

        // 查询发货明细
        List<DeliveryOrderItem> items = deliveryOrderItemMapper.selectList(
                new LambdaQueryWrapper<DeliveryOrderItem>()
                        .eq(DeliveryOrderItem::getDeliveryOrderId, deliveryOrder.getId())
        );

        List<DeliveryResponse.DeliveryItemResponse> itemResponses = items.stream()
                .map(this::convertItemToResponse)
                .collect(Collectors.toList());

        response.setItems(itemResponses);

        return response;
    }

    /**
     * 发货明细实体转响应DTO
     */
    private DeliveryResponse.DeliveryItemResponse convertItemToResponse(DeliveryOrderItem item) {
        DeliveryResponse.DeliveryItemResponse response = new DeliveryResponse.DeliveryItemResponse();
        BeanUtils.copyProperties(item, response);

        // 查询产品名称
        if (item.getProductId() != null) {
            Product product = productMapper.selectById(item.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }

        return response;
    }
}
