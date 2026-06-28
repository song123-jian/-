package com.injectmes.service;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProdOrderCreateRequest;
import com.injectmes.dto.req.ProdOrderScheduleRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdOrderResponse;
import com.injectmes.service.prodorder.ProdOrderCommandService;
import com.injectmes.service.prodorder.ProdOrderQueryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

@Service
public class ProdOrderService {

    @Autowired
    private ProdOrderQueryService prodOrderQueryService;
    @Autowired
    private ProdOrderCommandService prodOrderCommandService;

    public R<PageResponse<ProdOrderResponse>> list(PageRequest request, String status,
                                                   Long productId, LocalDate startDate,
                                                   LocalDate endDate) {
        return prodOrderQueryService.list(request, status, productId, startDate, endDate);
    }

    public R<ProdOrderResponse> getById(Long id) {
        return prodOrderQueryService.getById(id);
    }

    public R<ProdOrderResponse> create(ProdOrderCreateRequest request) {
        return prodOrderCommandService.create(request);
    }

    public R<ProdOrderResponse> update(Long id, ProdOrderCreateRequest request) {
        return prodOrderCommandService.update(id, request);
    }

    public R<Void> delete(Long id) {
        return prodOrderCommandService.delete(id);
    }

    public R<Void> dispatch(Long id) {
        return prodOrderCommandService.dispatch(id);
    }

    public R<ProdOrderResponse> schedule(Long id, ProdOrderScheduleRequest request) {
        return prodOrderCommandService.schedule(id, request);
    }

    public R<Void> start(Long id) {
        return prodOrderCommandService.start(id);
    }

    public R<Void> pause(Long id) {
        return prodOrderCommandService.pause(id);
    }

    public R<Void> resume(Long id) {
        return prodOrderCommandService.resume(id);
    }

    public R<Void> finish(Long id) {
        return prodOrderCommandService.finish(id);
    }

    public R<Void> close(Long id) {
        return prodOrderCommandService.close(id);
    }
}
