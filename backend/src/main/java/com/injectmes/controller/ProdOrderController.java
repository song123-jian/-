package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdOrderCreateRequest;
import com.injectmes.dto.req.ProdOrderScheduleRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdOrderResponse;
import com.injectmes.service.ProdOrderService;
import jakarta.validation.Valid;
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

/**
 * 生产工单管理控制器
 */
@RestController
@RequestMapping("/api/prod-orders")
@Validated
public class ProdOrderController {

    @Autowired
    private ProdOrderService prodOrderService;

    /**
     * 工单列表
     */
    @GetMapping
    public R<PageResponse<ProdOrderResponse>> list(PageRequest request,
                                                   @RequestParam(name = "status", required = false) String status,
                                                   @RequestParam(name = "productId", required = false) Long productId,
                                                   @RequestParam(name = "startDate", required = false)
                                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                   @RequestParam(name = "endDate", required = false)
                                                   @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return prodOrderService.list(request, status, productId, startDate, endDate);
    }

    /**
     * 工单详情
     */
    @GetMapping("/{id}")
    public R<ProdOrderResponse> getById(@PathVariable(name = "id") Long id) {
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
    public R<ProdOrderResponse> update(@PathVariable(name = "id") Long id, @Valid @RequestBody ProdOrderCreateRequest request) {
        return prodOrderService.update(id, request);
    }

    /**
     * 删除工单
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable(name = "id") Long id) {
        return prodOrderService.delete(id);
    }

    /**
     * 下发工单
     */
    @PutMapping("/{id}/dispatch")
    public R<Void> dispatch(@PathVariable(name = "id") Long id) {
        return prodOrderService.dispatch(id);
    }

    /**
     * 排程
     */
    @PutMapping("/{id}/schedule")
    public R<ProdOrderResponse> schedule(@PathVariable(name = "id") Long id, @Valid @RequestBody ProdOrderScheduleRequest request) {
        return prodOrderService.schedule(id, request);
    }

    /**
     * 开工
     */
    @PutMapping("/{id}/start")
    public R<Void> start(@PathVariable(name = "id") Long id) {
        return prodOrderService.start(id);
    }

    /**
     * 暂停
     */
    @PutMapping("/{id}/pause")
    public R<Void> pause(@PathVariable(name = "id") Long id) {
        return prodOrderService.pause(id);
    }

    /**
     * 恢复
     */
    @PutMapping("/{id}/resume")
    public R<Void> resume(@PathVariable(name = "id") Long id) {
        return prodOrderService.resume(id);
    }

    /**
     * 完工
     */
    @PutMapping("/{id}/finish")
    public R<Void> finish(@PathVariable(name = "id") Long id) {
        return prodOrderService.finish(id);
    }

    /**
     * 关闭
     */
    @PutMapping("/{id}/close")
    public R<Void> close(@PathVariable(name = "id") Long id) {
        return prodOrderService.close(id);
    }
}
