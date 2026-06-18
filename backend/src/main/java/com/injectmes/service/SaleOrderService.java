package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.SaleOrderCreateRequest;
import com.injectmes.dto.req.SaleOrderItemDTO;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.SaleOrderResponse;
import com.injectmes.entity.Customer;
import com.injectmes.entity.Product;
import com.injectmes.entity.SaleOrder;
import com.injectmes.entity.SaleOrderItem;
import com.injectmes.enums.SaleOrderStatus;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.CustomerMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.SaleOrderItemMapper;
import com.injectmes.mapper.SaleOrderMapper;
import org.springframework.beans.BeanUtils;
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
 * 销售订单服务
 */
@Service
public class SaleOrderService {

    @Autowired
    private SaleOrderMapper saleOrderMapper;

    @Autowired
    private SaleOrderItemMapper saleOrderItemMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    @Autowired
    private CustomerMapper customerMapper;

    @Autowired
    private ProductMapper productMapper;

    /**
     * 分页查询销售订单列表
     * 支持status筛选、keyword搜索orderNo、日期范围筛选
     *
     * @param request   分页请求
     * @param status    订单状态筛选
     * @param startDate 开始日期
     * @param endDate   结束日期
     * @return 分页响应
     */
    public R<PageResponse<SaleOrderResponse>> list(PageRequest request, String status,
                                                    LocalDate startDate, LocalDate endDate) {
        Page<SaleOrder> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<SaleOrder> wrapper = new LambdaQueryWrapper<>();

        // 状态筛选
        if (status != null && !status.trim().isEmpty()) {
            wrapper.eq(SaleOrder::getStatus, status);
        }

        // 关键词搜索订单号
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(SaleOrder::getOrderNo, keyword);
        }

        // 日期范围筛选
        if (startDate != null) {
            wrapper.ge(SaleOrder::getOrderDate, startDate);
        }
        if (endDate != null) {
            wrapper.le(SaleOrder::getOrderDate, endDate);
        }

        // 按创建时间降序
        wrapper.orderByDesc(SaleOrder::getCreatedAt);

        Page<SaleOrder> result = saleOrderMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<SaleOrderResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<SaleOrderResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询销售订单（含明细列表）
     *
     * @param id 订单ID
     * @return 订单响应
     */
    public R<SaleOrderResponse> getById(Long id) {
        SaleOrder saleOrder = saleOrderMapper.selectById(id);
        if (saleOrder == null) {
            throw new BusinessException("销售订单不存在");
        }

        SaleOrderResponse response = convertToResponse(saleOrder);

        // 查询订单明细
        List<SaleOrderItem> items = saleOrderItemMapper.selectList(
                new LambdaQueryWrapper<SaleOrderItem>()
                        .eq(SaleOrderItem::getSaleOrderId, id)
        );

        List<SaleOrderResponse.SaleOrderItemResponse> itemResponses = items.stream()
                .map(this::convertItemToResponse)
                .collect(Collectors.toList());

        response.setItems(itemResponses);

        return R.ok(response);
    }

    /**
     * 创建销售订单（含明细，自动生成订单号，计算总金额）
     *
     * @param request 创建订单请求
     * @return 订单响应
     */
    @Transactional
    public R<SaleOrderResponse> create(SaleOrderCreateRequest request) {
        // 生成订单号：SO+YYYYMMDD+3位序号
        String orderNo = generateOrderNo();

        SaleOrder saleOrder = new SaleOrder();
        saleOrder.setOrderNo(orderNo);
        saleOrder.setCustomerId(request.getCustomerId());
        saleOrder.setOrderDate(request.getOrderDate());
        saleOrder.setDeliveryDate(request.getDeliveryDate());
        saleOrder.setStatus(SaleOrderStatus.DRAFT.name());
        saleOrder.setRemark(request.getRemark());
        saleOrder.setCreatedAt(LocalDateTime.now());
        saleOrder.setUpdatedAt(LocalDateTime.now());

        // 计算总金额并保存明细
        BigDecimal totalAmount = BigDecimal.ZERO;
        saleOrderMapper.insert(saleOrder);

        for (SaleOrderItemDTO itemDTO : request.getItems()) {
            SaleOrderItem item = new SaleOrderItem();
            item.setSaleOrderId(saleOrder.getId());
            item.setProductId(itemDTO.getProductId());
            item.setQty(itemDTO.getQty());
            item.setUnitPrice(itemDTO.getUnitPrice());
            // 计算明细金额 = 数量 × 单价
            BigDecimal amount = itemDTO.getUnitPrice().multiply(BigDecimal.valueOf(itemDTO.getQty()));
            item.setAmount(amount);
            item.setDeliveredQty(0);
            item.setProducedQty(0);
            item.setRemark(itemDTO.getRemark());

            saleOrderItemMapper.insert(item);
            totalAmount = totalAmount.add(amount);
        }

        // 更新总金额
        saleOrder.setTotalAmount(totalAmount);
        saleOrderMapper.updateById(saleOrder);

        return getById(saleOrder.getId());
    }

    /**
     * 编辑销售订单（仅DRAFT状态可编辑）
     *
     * @param id      订单ID
     * @param request 编辑订单请求
     * @return 订单响应
     */
    @Transactional
    public R<SaleOrderResponse> update(Long id, SaleOrderCreateRequest request) {
        SaleOrder saleOrder = saleOrderMapper.selectById(id);
        if (saleOrder == null) {
            throw new BusinessException("销售订单不存在");
        }

        // 仅草稿状态可编辑
        if (!SaleOrderStatus.DRAFT.name().equals(saleOrder.getStatus())) {
            throw new BusinessException("仅草稿状态的订单可编辑");
        }

        // 更新主表信息
        saleOrder.setCustomerId(request.getCustomerId());
        saleOrder.setOrderDate(request.getOrderDate());
        saleOrder.setDeliveryDate(request.getDeliveryDate());
        saleOrder.setRemark(request.getRemark());
        saleOrder.setUpdatedAt(LocalDateTime.now());

        // 删除原有明细
        saleOrderItemMapper.delete(
                new LambdaQueryWrapper<SaleOrderItem>()
                        .eq(SaleOrderItem::getSaleOrderId, id)
        );

        // 重新插入明细并计算总金额
        BigDecimal totalAmount = BigDecimal.ZERO;
        for (SaleOrderItemDTO itemDTO : request.getItems()) {
            SaleOrderItem item = new SaleOrderItem();
            item.setSaleOrderId(id);
            item.setProductId(itemDTO.getProductId());
            item.setQty(itemDTO.getQty());
            item.setUnitPrice(itemDTO.getUnitPrice());
            BigDecimal amount = itemDTO.getUnitPrice().multiply(BigDecimal.valueOf(itemDTO.getQty()));
            item.setAmount(amount);
            item.setDeliveredQty(0);
            item.setProducedQty(0);
            item.setRemark(itemDTO.getRemark());

            saleOrderItemMapper.insert(item);
            totalAmount = totalAmount.add(amount);
        }

        saleOrder.setTotalAmount(totalAmount);
        saleOrderMapper.updateById(saleOrder);

        return getById(id);
    }

    /**
     * 确认订单 DRAFT→CONFIRMED
     *
     * @param id 订单ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> confirm(Long id) {
        SaleOrder saleOrder = saleOrderMapper.selectById(id);
        if (saleOrder == null) {
            throw new BusinessException("销售订单不存在");
        }

        // 校验状态流转：仅DRAFT可确认
        if (!SaleOrderStatus.DRAFT.name().equals(saleOrder.getStatus())) {
            throw new BusinessException("仅草稿状态的订单可确认");
        }

        saleOrder.setStatus(SaleOrderStatus.CONFIRMED.name());
        saleOrder.setUpdatedAt(LocalDateTime.now());
        saleOrderMapper.updateById(saleOrder);

        return R.ok("确认成功", null);
    }

    /**
     * 取消订单 DRAFT/CONFIRMED→CANCELLED
     *
     * @param id 订单ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> cancel(Long id) {
        SaleOrder saleOrder = saleOrderMapper.selectById(id);
        if (saleOrder == null) {
            throw new BusinessException("销售订单不存在");
        }

        // 校验状态流转：仅DRAFT和CONFIRMED可取消
        String currentStatus = saleOrder.getStatus();
        if (!SaleOrderStatus.DRAFT.name().equals(currentStatus)
                && !SaleOrderStatus.CONFIRMED.name().equals(currentStatus)) {
            throw new BusinessException("仅草稿或已确认状态的订单可取消");
        }

        saleOrder.setStatus(SaleOrderStatus.CANCELLED.name());
        saleOrder.setUpdatedAt(LocalDateTime.now());
        saleOrderMapper.updateById(saleOrder);

        return R.ok("取消成功", null);
    }

    /**
     * 生成订单号：SO+YYYYMMDD+3位序号（如SO20260617001）
     */
    private String generateOrderNo() {
        return seqNumberService.generateNo("SO", 3);
    }

    /**
     * 实体转响应DTO
     */
    private SaleOrderResponse convertToResponse(SaleOrder saleOrder) {
        SaleOrderResponse response = new SaleOrderResponse();
        BeanUtils.copyProperties(saleOrder, response);

        // 查询客户名称
        if (saleOrder.getCustomerId() != null) {
            Customer customer = customerMapper.selectById(saleOrder.getCustomerId());
            if (customer != null) {
                response.setCustomerName(customer.getName());
            }
        }

        return response;
    }

    /**
     * 明细实体转响应DTO
     */
    private SaleOrderResponse.SaleOrderItemResponse convertItemToResponse(SaleOrderItem item) {
        SaleOrderResponse.SaleOrderItemResponse response = new SaleOrderResponse.SaleOrderItemResponse();
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
