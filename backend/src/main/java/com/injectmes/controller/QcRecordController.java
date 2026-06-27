package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.QcRecordRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.QcRecordResponse;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.Product;
import com.injectmes.entity.QcRecord;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.QcRecordMapper;
import com.injectmes.service.QcRecordService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 质检记录控制器
 */
@RestController
@RequestMapping("/api/qc-records")
@Validated
public class QcRecordController {

    @Autowired
    private QcRecordService qcRecordService;

    @Autowired
    private QcRecordMapper qcRecordMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private ProductMapper productMapper;

    /**
     * 质检录入
     */
    @PostMapping
    public R<QcRecordResponse> create(@Valid @RequestBody QcRecordRequest request) {
        return qcRecordService.create(request);
    }

    /**
     * 待质检工单（移动端兼容）
     */
    @GetMapping("/pending-orders")
    public R<List<Map<String, Object>>> pendingOrders() {
        List<ProdOrder> orders = prodOrderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProdOrder>()
                        .in(ProdOrder::getStatus,
                                ProdOrderStatus.SCHEDULED.name(),
                                ProdOrderStatus.RUNNING.name(),
                                ProdOrderStatus.PAUSED.name())
                        .orderByDesc(ProdOrder::getCreatedAt)
        );
        List<Map<String, Object>> result = new ArrayList<>();
        for (ProdOrder order : orders) {
            Product product = order.getProductId() != null ? productMapper.selectById(order.getProductId()) : null;
            Map<String, Object> row = new java.util.HashMap<>();
            row.put("workOrderId", order.getId());
            row.put("workOrderNo", order.getOrderNo());
            row.put("productId", order.getProductId());
            row.put("productName", product != null ? product.getName() : "");
            row.put("status", order.getStatus());
            result.add(row);
        }
        return R.ok(result);
    }

    /**
     * 上传质检照片（移动端兼容）
     */
    @PostMapping("/upload")
    public R<Map<String, Object>> upload(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return R.fail("上传文件不能为空");
        }
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "qc";
        String safeName = System.currentTimeMillis() + "_" + originalName.replaceAll("[\\\\/:*?\"<>|]", "_");
        java.nio.file.Path uploadDir = java.nio.file.Paths.get("uploads", "qc");
        try {
            java.nio.file.Files.createDirectories(uploadDir);
            java.nio.file.Path target = uploadDir.resolve(safeName);
            java.nio.file.Files.copy(file.getInputStream(), target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            return R.ok(Map.of("url", "/uploads/qc/" + safeName));
        } catch (Exception e) {
            return R.fail("上传失败");
        }
    }

    /**
     * 质检记录列表（支持prodOrderId/productId/checkType筛选）
     */
    @GetMapping
    public R<PageResponse<QcRecordResponse>> list(PageRequest request,
                                                    @RequestParam(required = false) Long prodOrderId,
                                                    @RequestParam(required = false) Long productId,
                                                    @RequestParam(required = false) String checkType,
                                                    @RequestParam(required = false) String checkResult,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return qcRecordService.list(request, prodOrderId, productId, checkType, checkResult, startDate, endDate);
    }

    /**
     * 质量追溯查询（按批次/模次/产品）
     */
    @GetMapping("/trace")
    public R<List<QcRecordResponse>> trace(@RequestParam(required = false) Long productId,
                                             @RequestParam(required = false) String batchNo,
                                             @RequestParam(required = false) Long prodOrderId) {
        return qcRecordService.trace(productId, batchNo, prodOrderId);
    }

    /**
     * 更新质检
     */
    @PutMapping("/{id}")
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody QcRecordRequest request) {
        QcRecord qcRecord = qcRecordMapper.selectById(id);
        if (qcRecord == null) {
            return R.fail("质检记录不存在");
        }
        BeanUtils.copyProperties(request, qcRecord);
        qcRecord.setId(id);
        qcRecordMapper.updateById(qcRecord);
        return R.ok("更新成功", null);
    }

    /**
     * 删除质检
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        qcRecordMapper.deleteById(id);
        return R.ok("删除成功", null);
    }
}
