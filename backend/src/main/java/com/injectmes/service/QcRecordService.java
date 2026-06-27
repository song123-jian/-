package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.QcRecordRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.QcRecordResponse;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.Product;
import com.injectmes.entity.QcRecord;
import com.injectmes.entity.SysUser;
import com.injectmes.enums.CheckResult;
import com.injectmes.enums.CheckType;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.QcRecordMapper;
import com.injectmes.mapper.SysUserMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import com.injectmes.security.LoginUserDetails;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 质检记录服务
 */
@Service
public class QcRecordService {

    @Autowired
    private QcRecordMapper qcRecordMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 质检录入
     * - PASS：更新工单qualified_qty
     * - FAIL：记录不良，更新工单bad_qty
     * - CONDITIONAL：需老板确认
     * - 首件检验（FAI）不合格时，不允许批量报产
     *
     * @param request 质检请求
     * @return 质检响应
     */
    @Transactional
    public R<QcRecordResponse> create(QcRecordRequest request) {
        // 1. 校验工单存在
        ProdOrder order = prodOrderMapper.selectById(request.getProdOrderId());
        if (order == null) {
            throw new BusinessException("生产工单不存在");
        }

        // 2. 校验产品存在
        Long productId = request.getProductId() != null ? request.getProductId() : order.getProductId();
        Product product = productMapper.selectById(productId);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }
        if (order.getProductId() != null && !order.getProductId().equals(product.getId())) {
            throw new BusinessException("质检产品与工单产品不一致");
        }

        // 3. 构建质检记录
        QcRecord qcRecord = new QcRecord();
        BeanUtils.copyProperties(request, qcRecord);
        qcRecord.setProductId(product.getId());
        qcRecord.setCheckerId(resolveCurrentUserId());
        qcRecord.setCheckTime(LocalDateTime.now());
        qcRecord.setCreatedAt(LocalDateTime.now());

        if (request.getImageUrls() != null && !request.getImageUrls().trim().isEmpty()) {
            qcRecord.setImageUrls(request.getImageUrls());
        }

        String checkResult = request.getCheckResult();
        String checkType = request.getCheckType();

        // 4. 根据检验结果处理
        if (CheckResult.PASS.name().equals(checkResult)) {
            // PASS：合格 → 更新工单qualified_qty
            int currentQualified = order.getQualifiedQty() != null ? order.getQualifiedQty() : 0;
            int sampleQty = request.getSampleQty() != null ? request.getSampleQty() : 0;
            int defectQty = request.getDefectQty() != null ? request.getDefectQty() : 0;
            order.setQualifiedQty(currentQualified + sampleQty - defectQty);
            order.setUpdatedAt(LocalDateTime.now());
            prodOrderMapper.updateById(order);

        } else if (CheckResult.FAIL.name().equals(checkResult)) {
            // FAIL：不合格 → 记录不良，更新工单bad_qty
            int defectQty = request.getDefectQty() != null ? request.getDefectQty() : 0;
            int currentBadQty = order.getBadQty() != null ? order.getBadQty() : 0;
            order.setBadQty(currentBadQty + defectQty);
            order.setUpdatedAt(LocalDateTime.now());
            prodOrderMapper.updateById(order);

            // 首件检验（FAI）不合格时，不允许批量报产
            if (CheckType.FAI.name().equals(checkType)) {
                // 标记工单FAI不合格，后续报工时需校验
                // 此处通过抛出业务异常提示，前端应阻止批量报产
                throw new BusinessException("首件检验不合格，不允许批量报产，请处理不良品后重新送检");
            }

        } else if (CheckResult.CONDITIONAL.name().equals(checkResult)) {
            // CONDITIONAL：让步接收 → 需老板确认后让步入库
            // 此处仅记录，实际入库需老板确认流程
        }

        // 5. 插入质检记录
        qcRecordMapper.insert(qcRecord);

        return R.ok("质检录入成功", convertToResponse(qcRecord));
    }

    /**
     * 质检记录列表（分页，支持prodOrderId/productId/checkType筛选）
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<QcRecordResponse>> list(PageRequest request, Long prodOrderId, Long productId, String checkType,
                                                   String checkResult, LocalDate startDate, LocalDate endDate) {
        Page<QcRecord> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<QcRecord> wrapper = new LambdaQueryWrapper<>();

        // 按工单ID筛选
        if (prodOrderId != null) {
            wrapper.eq(QcRecord::getProdOrderId, prodOrderId);
        }

        // 按产品ID筛选
        if (productId != null) {
            wrapper.eq(QcRecord::getProductId, productId);
        }

        // 按检验类型筛选
        if (checkType != null && !checkType.trim().isEmpty()) {
            wrapper.eq(QcRecord::getCheckType, checkType);
        }

        // 按检验结果筛选
        if (checkResult != null && !checkResult.trim().isEmpty()) {
            wrapper.eq(QcRecord::getCheckResult, checkResult);
        }

        // 按日期范围筛选
        if (startDate != null) {
            wrapper.ge(QcRecord::getCreatedAt, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(QcRecord::getCreatedAt, endDate.plusDays(1).atStartOfDay());
        }

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(QcRecord::getDefectType, keyword)
                    .or().like(QcRecord::getDefectDesc, keyword)
            );
        }

        // 按创建时间降序
        wrapper.orderByDesc(QcRecord::getCreatedAt);

        Page<QcRecord> result = qcRecordMapper.selectPage(page, wrapper);

        List<QcRecordResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<QcRecordResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 质量追溯查询（按批次/模次/产品）
     *
     * @param productId   产品ID
     * @param batchNo     批次号（暂用工单编号替代）
     * @param prodOrderId 工单ID
     * @return 质检记录列表
     */
    public R<List<QcRecordResponse>> trace(Long productId, String batchNo, Long prodOrderId) {
        LambdaQueryWrapper<QcRecord> wrapper = new LambdaQueryWrapper<>();

        // 按产品ID追溯
        if (productId != null) {
            wrapper.eq(QcRecord::getProductId, productId);
        }

        // 按工单ID追溯（批次号通过工单编号关联）
        if (prodOrderId != null) {
            wrapper.eq(QcRecord::getProdOrderId, prodOrderId);
        }

        // 按批次号追溯（通过工单编号匹配）
        if (batchNo != null && !batchNo.trim().isEmpty()) {
            // 查找对应工单
            ProdOrder order = prodOrderMapper.selectOne(
                    new LambdaQueryWrapper<ProdOrder>().eq(ProdOrder::getOrderNo, batchNo)
            );
            if (order != null) {
                wrapper.eq(QcRecord::getProdOrderId, order.getId());
            } else {
                // 找不到对应工单，返回空列表
                return R.ok(List.of());
            }
        }

        // 按检验时间降序
        wrapper.orderByDesc(QcRecord::getCheckTime);

        List<QcRecord> records = qcRecordMapper.selectList(wrapper);

        List<QcRecordResponse> responses = records.stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        return R.ok(responses);
    }

    private Long resolveCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUserDetails userDetails) {
            return userDetails.getUserId();
        }
        return null;
    }

    /**
     * 实体转响应DTO
     */
    private QcRecordResponse convertToResponse(QcRecord qcRecord) {
        QcRecordResponse response = new QcRecordResponse();
        BeanUtils.copyProperties(qcRecord, response);

        // 填充工单编号
        if (qcRecord.getProdOrderId() != null) {
            ProdOrder order = prodOrderMapper.selectById(qcRecord.getProdOrderId());
            if (order != null) {
                response.setOrderNo(order.getOrderNo());
            }
        }

        // 填充产品名称
        if (qcRecord.getProductId() != null) {
            Product product = productMapper.selectById(qcRecord.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }

        // 填充检验人姓名
        if (qcRecord.getCheckerId() != null) {
            SysUser user = sysUserMapper.selectById(qcRecord.getCheckerId());
            if (user != null) {
                response.setCheckerName(user.getRealName());
            }
        }

        return response;
    }
}
