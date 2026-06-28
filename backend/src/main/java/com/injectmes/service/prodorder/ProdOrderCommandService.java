package com.injectmes.service.prodorder;

import com.injectmes.common.R;
import com.injectmes.dto.req.ProdOrderCreateRequest;
import com.injectmes.dto.req.ProdOrderScheduleRequest;
import com.injectmes.dto.resp.ProdOrderResponse;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.SaleOrder;
import com.injectmes.enums.ProdOrderStatus;
import com.injectmes.enums.SaleOrderStatus;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.SaleOrderMapper;
import com.injectmes.service.SeqNumberService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class ProdOrderCommandService {

    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private SaleOrderMapper saleOrderMapper;
    @Autowired
    private SeqNumberService seqNumberService;
    @Autowired
    private ProdOrderQueryService prodOrderQueryService;

    @Transactional
    public R<ProdOrderResponse> create(ProdOrderCreateRequest request) {
        ProdOrder prodOrder = new ProdOrder();
        prodOrder.setOrderNo(generateOrderNo());
        copyCreateRequest(request, prodOrder);
        prodOrder.setCompletedQty(0);
        prodOrder.setQualifiedQty(0);
        prodOrder.setBadQty(0);
        prodOrder.setStatus(ProdOrderStatus.WAITING.name());
        touch(prodOrder);
        prodOrderMapper.insert(prodOrder);

        syncSaleOrderStatus(request.getSaleOrderId());
        return R.ok("创建成功", prodOrderQueryService.getById(prodOrder.getId()).getData());
    }

    @Transactional
    public R<ProdOrderResponse> update(Long id, ProdOrderCreateRequest request) {
        ProdOrder prodOrder = requireOrder(id);
        copyCreateRequest(request, prodOrder);
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("更新成功", prodOrderQueryService.getById(id).getData());
    }

    @Transactional
    public R<Void> delete(Long id) {
        requireOrder(id);
        prodOrderMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    @Transactional
    public R<Void> dispatch(Long id) {
        ProdOrder prodOrder = requireOrder(id);
        ensureStatus(prodOrder, ProdOrderStatus.WAITING, "仅待下发状态的工单可下发");
        prodOrder.setStatus(ProdOrderStatus.SCHEDULED.name());
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("下发成功", null);
    }

    @Transactional
    public R<ProdOrderResponse> schedule(Long id, ProdOrderScheduleRequest request) {
        ProdOrder prodOrder = requireOrder(id);
        ensureStatus(prodOrder, ProdOrderStatus.WAITING, "仅待排产状态的工单可排产");

        prodOrder.setMachineId(request.getMachineId());
        prodOrder.setMoldId(request.getMoldId());
        prodOrder.setPlanStart(request.getPlanStart());
        prodOrder.setPlanEnd(request.getPlanEnd());
        prodOrder.setStatus(ProdOrderStatus.SCHEDULED.name());
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);

        return R.ok("排产成功", prodOrderQueryService.getById(id).getData());
    }

    @Transactional
    public R<Void> start(Long id) {
        ProdOrder prodOrder = requireOrder(id);
        ensureStatus(prodOrder, ProdOrderStatus.SCHEDULED, "仅已排产状态的工单可开工");
        prodOrder.setStatus(ProdOrderStatus.RUNNING.name());
        prodOrder.setActualStart(LocalDateTime.now());
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("开工成功", null);
    }

    @Transactional
    public R<Void> pause(Long id) {
        ProdOrder prodOrder = requireOrder(id);
        ensureStatus(prodOrder, ProdOrderStatus.RUNNING, "仅生产中状态的工单可暂停");
        prodOrder.setStatus(ProdOrderStatus.PAUSED.name());
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("暂停成功", null);
    }

    @Transactional
    public R<Void> resume(Long id) {
        ProdOrder prodOrder = requireOrder(id);
        ensureStatus(prodOrder, ProdOrderStatus.PAUSED, "仅已暂停状态的工单可恢复");
        prodOrder.setStatus(ProdOrderStatus.RUNNING.name());
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("恢复成功", null);
    }

    @Transactional
    public R<Void> finish(Long id) {
        ProdOrder prodOrder = requireOrder(id);
        ensureStatus(prodOrder, ProdOrderStatus.RUNNING, "仅生产中状态的工单可完工");
        prodOrder.setStatus(ProdOrderStatus.FINISHED.name());
        prodOrder.setActualEnd(LocalDateTime.now());
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("完工成功", null);
    }

    @Transactional
    public R<Void> close(Long id) {
        ProdOrder prodOrder = requireOrder(id);
        ensureStatus(prodOrder, ProdOrderStatus.FINISHED, "仅已完工状态的工单可关闭");
        prodOrder.setStatus(ProdOrderStatus.CLOSED.name());
        touch(prodOrder);
        prodOrderMapper.updateById(prodOrder);
        return R.ok("关闭成功", null);
    }

    private void copyCreateRequest(ProdOrderCreateRequest request, ProdOrder prodOrder) {
        prodOrder.setSaleOrderId(request.getSaleOrderId());
        prodOrder.setSaleOrderItemId(request.getSaleOrderItemId());
        prodOrder.setProductId(request.getProductId());
        prodOrder.setMachineId(request.getMachineId());
        prodOrder.setMoldId(request.getMoldId());
        prodOrder.setPlanQty(request.getPlanQty());
        prodOrder.setRawMaterialQty(request.getRawMaterialQty());
        prodOrder.setPlanStart(request.getPlanStart());
        prodOrder.setPlanEnd(request.getPlanEnd());
        prodOrder.setPriority(request.getPriority());
        prodOrder.setRemark(request.getRemark());
    }

    private void syncSaleOrderStatus(Long saleOrderId) {
        if (saleOrderId == null) {
            return;
        }
        SaleOrder saleOrder = saleOrderMapper.selectById(saleOrderId);
        if (saleOrder != null && SaleOrderStatus.CONFIRMED.name().equals(saleOrder.getStatus())) {
            saleOrder.setStatus(SaleOrderStatus.PRODUCING.name());
            saleOrder.setUpdatedAt(LocalDateTime.now());
            saleOrderMapper.updateById(saleOrder);
        }
    }

    private ProdOrder requireOrder(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new BusinessException("生产工单不存在");
        }
        return prodOrder;
    }

    private void ensureStatus(ProdOrder prodOrder, ProdOrderStatus expected, String message) {
        if (!expected.name().equals(prodOrder.getStatus())) {
            throw new BusinessException(message);
        }
    }

    private String generateOrderNo() {
        return seqNumberService.generateNo("PO", 3);
    }

    private void touch(ProdOrder prodOrder) {
        prodOrder.setUpdatedAt(LocalDateTime.now());
        if (prodOrder.getCreatedAt() == null) {
            prodOrder.setCreatedAt(LocalDateTime.now());
        }
    }
}
