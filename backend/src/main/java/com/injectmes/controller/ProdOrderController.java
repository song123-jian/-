package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdOrderCreateRequest;
import com.injectmes.dto.req.ProdOrderScheduleRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdOrderResponse;
import com.injectmes.entity.ProdOrder;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.service.ProdOrderService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/**
 * 生产工单管理控制器
 */
@RestController
@RequestMapping("/api/prod-orders")
@Validated
public class ProdOrderController {

    @Autowired
    private ProdOrderService prodOrderService;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    /**
     * 工单列表（分页，支持status筛选、productId筛选、日期范围）
     */
    @GetMapping
    public R<PageResponse<ProdOrderResponse>> list(PageRequest request,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(required = false) Long productId,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return prodOrderService.list(request, status, productId, startDate, endDate);
    }

    /**
     * 工单详情
     */
    @GetMapping("/{id}")
    public R<ProdOrderResponse> getById(@PathVariable Long id) {
        return prodOrderService.getById(id);
    }

    /**
     * 创建工单
     */
    @PostMapping
    public R<ProdOrderResponse> create(@Valid @RequestBody ProdOrderCreateRequest request) {
        return prodOrderService.create(request);
    }

    /**
     * 更新工单
     */
    @PutMapping("/{id}")
    public R<Void> update(@PathVariable Long id, @Valid @RequestBody ProdOrderCreateRequest request) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            return R.fail("生产工单不存在");
        }
        BeanUtils.copyProperties(request, prodOrder);
        prodOrder.setId(id);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("更新成功", null);
    }

    /**
     * 删除工单
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        prodOrderMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    /**
     * 下发工单（更新状态为SCHEDULED）
     */
    @PutMapping("/{id}/dispatch")
    public R<Void> dispatch(@PathVariable Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            return R.fail("生产工单不存在");
        }
        prodOrder.setStatus(ProdOrderStatus.SCHEDULED.name());
        prodOrderMapper.updateById(prodOrder);
        return R.ok("下发成功", null);
    }

    /**
     * 排程
     */
    @PutMapping("/{id}/schedule")
    public R<ProdOrderResponse> schedule(@PathVariable Long id, @Valid @RequestBody ProdOrderScheduleRequest request) {
        return prodOrderService.schedule(id, request);
    }

    /**
     * 开工
     */
    @PutMapping("/{id}/start")
    public R<Void> start(@PathVariable Long id) {
        return prodOrderService.start(id);
    }

    /**
     * 暂停
     */
    @PutMapping("/{id}/pause")
    public R<Void> pause(@PathVariable Long id) {
        return prodOrderService.pause(id);
    }

    /**
     * 恢复
     */
    @PutMapping("/{id}/resume")
    public R<Void> resume(@PathVariable Long id) {
        return prodOrderService.resume(id);
    }

    /**
     * 完工
     */
    @PutMapping("/{id}/finish")
    public R<Void> finish(@PathVariable Long id) {
        return prodOrderService.finish(id);
    }

    /**
     * 关闭
     */
    @PutMapping("/{id}/close")
    public R<Void> close(@PathVariable Long id) {
        return prodOrderService.close(id);
    }
}
