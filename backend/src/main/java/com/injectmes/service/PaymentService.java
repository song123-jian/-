package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.PaymentRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.PaymentResponse;
import com.injectmes.entity.Customer;
import com.injectmes.entity.PaymentRecord;
import com.injectmes.entity.SaleOrder;
import com.injectmes.entity.SysUser;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.CustomerMapper;
import com.injectmes.mapper.PaymentRecordMapper;
import com.injectmes.mapper.SaleOrderMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
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
 * 回款服务
 */
@Service
public class PaymentService {

    @Autowired
    private PaymentRecordMapper paymentRecordMapper;

    @Autowired
    private SaleOrderMapper saleOrderMapper;

    @Autowired
    private CustomerMapper customerMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    /**
     * 回款登记
     * - 校验回款不能超额：单笔回款 + 已回款不能超过订单金额
     * - 更新销售订单的received_amount
     * - 自动生成回款单号 PAY+YYYYMMDD+3位序号
     */
    @Transactional
    public R<PaymentResponse> create(PaymentRequest request) {
        // 校验销售订单存在
        SaleOrder saleOrder = saleOrderMapper.selectById(request.getSaleOrderId());
        if (saleOrder == null) {
            throw new BusinessException("销售订单不存在");
        }

        // 校验回款不能超额：单笔回款 + 已回款不能超过订单金额
        BigDecimal alreadyReceived = saleOrder.getReceivedAmount() != null
                ? saleOrder.getReceivedAmount() : BigDecimal.ZERO;
        BigDecimal totalAfterPayment = alreadyReceived.add(request.getPayAmount());
        if (totalAfterPayment.compareTo(saleOrder.getTotalAmount()) > 0) {
            throw new BusinessException("回款金额超额，订单总金额：" + saleOrder.getTotalAmount()
                    + "，已回款：" + alreadyReceived + "，本次回款后总额：" + totalAfterPayment);
        }

        // 自动生成回款单号 PAY+YYYYMMDD+3位序号
        String paymentNo = generatePaymentNo();

        PaymentRecord record = new PaymentRecord();
        record.setPaymentNo(paymentNo);
        record.setCustomerId(request.getCustomerId());
        record.setSaleOrderId(request.getSaleOrderId());
        record.setPayAmount(request.getPayAmount());
        record.setPayDate(request.getPayDate());
        record.setPayMethod(request.getPayMethod());
        record.setInvoiceNo(request.getInvoiceNo());
        record.setRemark(request.getRemark());
        record.setCreatedAt(LocalDateTime.now());
        paymentRecordMapper.insert(record);

        // 更新销售订单的received_amount
        saleOrder.setReceivedAmount(totalAfterPayment);
        saleOrder.setUpdatedAt(LocalDateTime.now());
        saleOrderMapper.updateById(saleOrder);

        return R.ok(convertToResponse(record));
    }

    /**
     * 回款记录列表（分页，支持customerId/saleOrderId筛选）
     */
    public R<PageResponse<PaymentResponse>> list(PageRequest request, Long customerId, Long saleOrderId) {
        Page<PaymentRecord> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<PaymentRecord> wrapper = new LambdaQueryWrapper<>();
        // 客户ID筛选
        if (customerId != null) {
            wrapper.eq(PaymentRecord::getCustomerId, customerId);
        }
        // 销售订单ID筛选
        if (saleOrderId != null) {
            wrapper.eq(PaymentRecord::getSaleOrderId, saleOrderId);
        }
        // 关键词搜索回款单号
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(PaymentRecord::getPaymentNo, keyword);
        }
        wrapper.orderByDesc(PaymentRecord::getCreatedAt);

        Page<PaymentRecord> result = paymentRecordMapper.selectPage(page, wrapper);

        List<PaymentResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<PaymentResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 应收账款（按客户汇总）
     */
    public R<List<Map<String, Object>>> receivables() {
        // 查询所有销售订单
        List<SaleOrder> allOrders = saleOrderMapper.selectList(null);

        // 按客户分组汇总
        Map<Long, BigDecimal> totalAmountMap = new HashMap<>();
        Map<Long, BigDecimal> receivedAmountMap = new HashMap<>();

        for (SaleOrder order : allOrders) {
            Long customerId = order.getCustomerId();
            if (customerId == null) {
                continue;
            }

            BigDecimal totalAmount = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
            BigDecimal receivedAmount = order.getReceivedAmount() != null ? order.getReceivedAmount() : BigDecimal.ZERO;

            totalAmountMap.merge(customerId, totalAmount, BigDecimal::add);
            receivedAmountMap.merge(customerId, receivedAmount, BigDecimal::add);
        }

        // 组装结果
        List<Map<String, Object>> result = new ArrayList<>();
        for (Long customerId : totalAmountMap.keySet()) {
            BigDecimal totalAmount = totalAmountMap.get(customerId);
            BigDecimal receivedAmount = receivedAmountMap.getOrDefault(customerId, BigDecimal.ZERO);
            BigDecimal receivableAmount = totalAmount.subtract(receivedAmount);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("customerId", customerId);

            // 查询客户名称
            Customer customer = customerMapper.selectById(customerId);
            item.put("customerName", customer != null ? customer.getName() : "");
            item.put("totalAmount", totalAmount);
            item.put("receivedAmount", receivedAmount);
            item.put("receivableAmount", receivableAmount);

            result.add(item);
        }

        // 按应收金额降序排列
        result.sort((a, b) -> {
            BigDecimal aa = (BigDecimal) a.get("receivableAmount");
            BigDecimal bb = (BigDecimal) b.get("receivableAmount");
            return bb.compareTo(aa);
        });

        return R.ok(result);
    }

    /**
     * 生成回款单号：PAY+YYYYMMDD+3位序号（如PAY20260617001）
     */
    @Transactional
    public R<PaymentResponse> update(Long id, PaymentRequest request) {
        PaymentRecord record = paymentRecordMapper.selectById(id);
        if (record == null) {
            throw new BusinessException("回款记录不存在");
        }
        BeanUtils.copyProperties(request, record);
        record.setId(id);
        paymentRecordMapper.updateById(record);
        return R.ok("更新成功", convertToResponse(record));
    }

    @Transactional
    public R<Void> delete(Long id) {
        PaymentRecord record = paymentRecordMapper.selectById(id);
        if (record == null) {
            throw new BusinessException("回款记录不存在");
        }
        paymentRecordMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    private String generatePaymentNo() {
        return seqNumberService.generateNo("PAY", 3);
    }

    /**
     * 实体转响应DTO
     */
    private PaymentResponse convertToResponse(PaymentRecord record) {
        PaymentResponse response = new PaymentResponse();
        BeanUtils.copyProperties(record, response);

        // 查询客户名称
        if (record.getCustomerId() != null) {
            Customer customer = customerMapper.selectById(record.getCustomerId());
            if (customer != null) {
                response.setCustomerName(customer.getName());
            }
        }

        // 查询订单编号
        if (record.getSaleOrderId() != null) {
            SaleOrder saleOrder = saleOrderMapper.selectById(record.getSaleOrderId());
            if (saleOrder != null) {
                response.setOrderNo(saleOrder.getOrderNo());
            }
        }

        // 查询创建人名称
        if (record.getCreatedBy() != null) {
            SysUser user = sysUserMapper.selectById(record.getCreatedBy());
            if (user != null) {
                response.setCreatorName(user.getRealName());
            }
        }

        return response;
    }
}
