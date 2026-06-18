package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdOrderCreateRequest;
import com.injectmes.dto.req.ProdOrderScheduleRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdOrderResponse;
import com.injectmes.entity.Machine;
import com.injectmes.entity.Mold;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.Product;
import com.injectmes.entity.SaleOrder;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.enums.SaleOrderStatus;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.SaleOrderMapper;
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
 * 生产工单服务
 */
@Service
public class ProdOrderService {

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private SaleOrderMapper saleOrderMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private MachineMapper machineMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    @Autowired
    private MoldMapper moldMapper;

    /**
     * 分页查询生产工单列表
     * 支持status筛选、productId筛选、日期范围
     *
     * @param request   分页请求
     * @param status    工单状态筛选
     * @param productId 产品ID筛选
     * @param startDate 开始日期
     * @param endDate   结束日期
     * @return 分页响应
     */
    public R<PageResponse<ProdOrderResponse>> list(PageRequest request, String status,
                                                    Long productId, LocalDate startDate,
                                                    LocalDate endDate) {
        Page<ProdOrder> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<ProdOrder> wrapper = new LambdaQueryWrapper<>();

        // 状态筛选
        if (status != null && !status.trim().isEmpty()) {
            wrapper.eq(ProdOrder::getStatus, status);
        }

        // 产品ID筛选
        if (productId != null) {
            wrapper.eq(ProdOrder::getProductId, productId);
        }

        // 日期范围筛选（按计划开始时间）
        if (startDate != null) {
            wrapper.ge(ProdOrder::getPlanStart, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.le(ProdOrder::getPlanStart, endDate.plusDays(1).atStartOfDay());
        }

        // 按创建时间降序
        wrapper.orderByDesc(ProdOrder::getCreatedAt);

        Page<ProdOrder> result = prodOrderMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<ProdOrderResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<ProdOrderResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询生产工单
     *
     * @param id 工单ID
     * @return 工单响应
     */
    public R<ProdOrderResponse> getById(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }
        return R.ok(convertToResponse(prodOrder));
    }

    /**
     * 创建生产工单（自动生成工单号，关联销售订单时更新其状态为PRODUCING）
     *
     * @param request 创建工单请求
     * @return 工单响应
     */
    @Transactional
    public R<ProdOrderResponse> create(ProdOrderCreateRequest request) {
        // 生成工单号：PO+YYYYMMDD+3位序号
        String orderNo = generateOrderNo();

        ProdOrder prodOrder = new ProdOrder();
        prodOrder.setOrderNo(orderNo);
        prodOrder.setSaleOrderId(request.getSaleOrderId());
        prodOrder.setSaleOrderItemId(request.getSaleOrderItemId());
        prodOrder.setProductId(request.getProductId());
        prodOrder.setMachineId(request.getMachineId());
        prodOrder.setMoldId(request.getMoldId());
        prodOrder.setPlanQty(request.getPlanQty());
        prodOrder.setCompletedQty(0);
        prodOrder.setQualifiedQty(0);
        prodOrder.setBadQty(0);
        prodOrder.setRawMaterialQty(request.getRawMaterialQty());
        prodOrder.setPlanStart(request.getPlanStart());
        prodOrder.setPlanEnd(request.getPlanEnd());
        prodOrder.setStatus(ProdOrderStatus.WAITING.name());
        prodOrder.setPriority(request.getPriority());
        prodOrder.setRemark(request.getRemark());
        prodOrder.setCreatedAt(LocalDateTime.now());
        prodOrder.setUpdatedAt(LocalDateTime.now());

        prodOrderMapper.insert(prodOrder);

        // 关联销售订单时，更新销售订单状态为PRODUCING
        if (request.getSaleOrderId() != null) {
            SaleOrder saleOrder = saleOrderMapper.selectById(request.getSaleOrderId());
            if (saleOrder != null && SaleOrderStatus.CONFIRMED.name().equals(saleOrder.getStatus())) {
                saleOrder.setStatus(SaleOrderStatus.PRODUCING.name());
                saleOrder.setUpdatedAt(LocalDateTime.now());
                saleOrderMapper.updateById(saleOrder);
            }
        }

        return R.ok("创建成功", convertToResponse(prodOrder));
    }

    /**
     * 排程 WAITING→SCHEDULED
     *
     * @param id      工单ID
     * @param request 排程请求
     * @return 工单响应
     */
    @Transactional
    public R<ProdOrderResponse> schedule(Long id, ProdOrderScheduleRequest request) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }

        // 校验状态流转：仅WAITING可排程
        if (!ProdOrderStatus.WAITING.name().equals(prodOrder.getStatus())) {
            throw new BusinessException("仅待排产状态的工单可排程");
        }

        prodOrder.setMachineId(request.getMachineId());
        prodOrder.setMoldId(request.getMoldId());
        prodOrder.setPlanStart(request.getPlanStart());
        prodOrder.setPlanEnd(request.getPlanEnd());
        prodOrder.setStatus(ProdOrderStatus.SCHEDULED.name());
        prodOrder.setUpdatedAt(LocalDateTime.now());
        prodOrderMapper.updateById(prodOrder);

        return R.ok("排程成功", convertToResponse(prodOrder));
    }

    /**
     * 开工 SCHEDULED→RUNNING，记录actualStart
     *
     * @param id 工单ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> start(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }

        // 校验状态流转：仅SCHEDULED可开工
        if (!ProdOrderStatus.SCHEDULED.name().equals(prodOrder.getStatus())) {
            throw new BusinessException("仅已排产状态的工单可开工");
        }

        prodOrder.setStatus(ProdOrderStatus.RUNNING.name());
        prodOrder.setActualStart(LocalDateTime.now());
        prodOrder.setUpdatedAt(LocalDateTime.now());
        prodOrderMapper.updateById(prodOrder);

        return R.ok("开工成功", null);
    }

    /**
     * 暂停 RUNNING→PAUSED
     *
     * @param id 工单ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> pause(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }

        // 校验状态流转：仅RUNNING可暂停
        if (!ProdOrderStatus.RUNNING.name().equals(prodOrder.getStatus())) {
            throw new BusinessException("仅生产中状态的工单可暂停");
        }

        prodOrder.setStatus(ProdOrderStatus.PAUSED.name());
        prodOrder.setUpdatedAt(LocalDateTime.now());
        prodOrderMapper.updateById(prodOrder);

        return R.ok("暂停成功", null);
    }

    /**
     * 恢复 PAUSED→RUNNING
     *
     * @param id 工单ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> resume(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }

        // 校验状态流转：仅PAUSED可恢复
        if (!ProdOrderStatus.PAUSED.name().equals(prodOrder.getStatus())) {
            throw new BusinessException("仅已暂停状态的工单可恢复");
        }

        prodOrder.setStatus(ProdOrderStatus.RUNNING.name());
        prodOrder.setUpdatedAt(LocalDateTime.now());
        prodOrderMapper.updateById(prodOrder);

        return R.ok("恢复成功", null);
    }

    /**
     * 完工 RUNNING→FINISHED，记录actualEnd，更新completedQty/qualifiedQty/badQty
     *
     * @param id 工单ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> finish(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }

        // 校验状态流转：仅RUNNING可完工
        if (!ProdOrderStatus.RUNNING.name().equals(prodOrder.getStatus())) {
            throw new BusinessException("仅生产中状态的工单可完工");
        }

        prodOrder.setStatus(ProdOrderStatus.FINISHED.name());
        prodOrder.setActualEnd(LocalDateTime.now());
        prodOrder.setUpdatedAt(LocalDateTime.now());
        prodOrderMapper.updateById(prodOrder);

        return R.ok("完工成功", null);
    }

    /**
     * 关闭 FINISHED→CLOSED
     *
     * @param id 工单ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> close(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }

        // 校验状态流转：仅FINISHED可关闭
        if (!ProdOrderStatus.FINISHED.name().equals(prodOrder.getStatus())) {
            throw new BusinessException("仅已完工状态的工单可关闭");
        }

        prodOrder.setStatus(ProdOrderStatus.CLOSED.name());
        prodOrder.setUpdatedAt(LocalDateTime.now());
        prodOrderMapper.updateById(prodOrder);

        return R.ok("关闭成功", null);
    }

    /**
     * 生成工单号：PO+YYYYMMDD+3位序号（如PO20260617001）
     */
    private String generateOrderNo() {
        return seqNumberService.generateNo("PO", 3);
    }

    /**
     * 实体转响应DTO
     */
    private ProdOrderResponse convertToResponse(ProdOrder prodOrder) {
        ProdOrderResponse response = new ProdOrderResponse();
        BeanUtils.copyProperties(prodOrder, response);

        // 查询产品名称
        if (prodOrder.getProductId() != null) {
            Product product = productMapper.selectById(prodOrder.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }

        // 查询注塑机名称
        if (prodOrder.getMachineId() != null) {
            Machine machine = machineMapper.selectById(prodOrder.getMachineId());
            if (machine != null) {
                response.setMachineName(machine.getName());
            }
        }

        // 查询模具名称
        if (prodOrder.getMoldId() != null) {
            Mold mold = moldMapper.selectById(prodOrder.getMoldId());
            if (mold != null) {
                response.setMoldName(mold.getName());
            }
        }

        return response;
    }
}
