package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.QcRecordRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.QcRecordResponse;
import com.injectmes.entity.QcRecord;
import com.injectmes.mapper.QcRecordMapper;
import com.injectmes.service.QcRecordService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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

    /**
     * 质检录入
     */
    @PostMapping
    public R<QcRecordResponse> create(@Valid @RequestBody QcRecordRequest request) {
        return qcRecordService.create(request);
    }

    /**
     * 质检记录列表（支持prodOrderId/productId/checkType筛选）
     */
    @GetMapping
    public R<PageResponse<QcRecordResponse>> list(PageRequest request,
                                                    @RequestParam(required = false) Long prodOrderId,
                                                    @RequestParam(required = false) Long productId,
                                                    @RequestParam(required = false) String checkType) {
        return qcRecordService.list(request, prodOrderId, productId, checkType);
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
