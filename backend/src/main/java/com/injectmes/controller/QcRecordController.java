package com.injectmes.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

    @PostMapping
    public R<QcRecordResponse> create(@Valid @RequestBody QcRecordRequest request) {
        return qcRecordService.create(request);
    }

    @GetMapping("/pending-orders")
    public R<List<Map<String, Object>>> pendingOrders() {
        return qcRecordService.pendingOrders();
    }

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

    @GetMapping
    public R<PageResponse<QcRecordResponse>> list(PageRequest request,
                                                  @RequestParam(name = "prodOrderId", required = false) Long prodOrderId,
                                                  @RequestParam(name = "productId", required = false) Long productId,
                                                  @RequestParam(name = "checkType", required = false) String checkType,
                                                  @RequestParam(name = "checkResult", required = false) String checkResult,
                                                  @RequestParam(name = "startDate", required = false)
                                                  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                  @RequestParam(name = "endDate", required = false)
                                                  @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return qcRecordService.list(request, prodOrderId, productId, checkType, checkResult, startDate, endDate);
    }

    @GetMapping("/trace")
    public R<List<QcRecordResponse>> trace(@RequestParam(name = "productId", required = false) Long productId,
                                           @RequestParam(name = "batchNo", required = false) String batchNo,
                                           @RequestParam(name = "prodOrderId", required = false) Long prodOrderId) {
        return qcRecordService.trace(productId, batchNo, prodOrderId);
    }

    @PutMapping("/{id}")
    public R<QcRecordResponse> update(@PathVariable(name = "id") Long id, @Valid @RequestBody QcRecordRequest request) {
        return qcRecordService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        return qcRecordService.delete(id);
    }
}
