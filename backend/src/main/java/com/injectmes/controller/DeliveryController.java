package com.injectmes.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.DeliveryCreateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.DeliveryResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.DeliveryOrder;
import com.injectmes.mapper.DeliveryOrderMapper;
import com.injectmes.service.DeliveryService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 发货管理控制器
 */
@RestController
@RequestMapping("/api")
@Validated
public class DeliveryController {

    @Autowired
    private DeliveryService deliveryService;

    @Autowired
    private DeliveryOrderMapper deliveryOrderMapper;

    /**
     * 发货单列表（分页）
     */
    @GetMapping("/deliveries")
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
     * 创建发货单
     */
    @PostMapping("/deliveries")
    public R<DeliveryResponse> create(@Valid @RequestBody DeliveryCreateRequest request) {
        return deliveryService.create(request);
    }

    /**
     * 确认发货
     */
    @PutMapping("/deliveries/{id}/ship")
    public R<Void> ship(@PathVariable Long id) {
        return deliveryService.ship(id);
    }

    /**
     * 确认签收
     */
    @PutMapping("/deliveries/{id}/receive")
    public R<Void> receive(@PathVariable Long id) {
        return deliveryService.receive(id);
    }

    /**
     * 更新发货单
     */
    @PutMapping("/deliveries/{id}")
    public R<Void> update(@PathVariable Long id, @RequestBody DeliveryCreateRequest request) {
        DeliveryOrder deliveryOrder = deliveryOrderMapper.selectById(id);
        if (deliveryOrder == null) {
            return R.fail("发货单不存在");
        }
        BeanUtils.copyProperties(request, deliveryOrder);
        deliveryOrder.setId(id);
        deliveryOrderMapper.updateById(deliveryOrder);
        return R.ok("更新成功", null);
    }

    /**
     * 删除发货单
     */
    @DeleteMapping("/deliveries/{id}")
    public R<Void> delete(@PathVariable Long id) {
        deliveryOrderMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    /**
     * 实体转响应DTO
     */
    private DeliveryResponse convertToResponse(DeliveryOrder deliveryOrder) {
        DeliveryResponse response = new DeliveryResponse();
        BeanUtils.copyProperties(deliveryOrder, response);
        return response;
    }
}
