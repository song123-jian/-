package com.injectmes.service.prodorder;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProdOrderResponse;
import com.injectmes.entity.Machine;
import com.injectmes.entity.Mold;
import com.injectmes.entity.ProdOrder;
import com.injectmes.entity.Product;
import com.injectmes.mapper.MachineMapper;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProdOrderMapper;
import com.injectmes.mapper.ProductMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ProdOrderQueryService {

    @Autowired
    private ProdOrderMapper prodOrderMapper;
    @Autowired
    private ProductMapper productMapper;
    @Autowired
    private MachineMapper machineMapper;
    @Autowired
    private MoldMapper moldMapper;

    public R<PageResponse<ProdOrderResponse>> list(PageRequest request, String status,
                                                   Long productId, LocalDate startDate,
                                                   LocalDate endDate) {
        Page<ProdOrder> page = new Page<>(request.getPage(), request.getSize());
        LambdaQueryWrapper<ProdOrder> wrapper = new LambdaQueryWrapper<>();

        if (status != null && !status.trim().isEmpty()) {
            wrapper.eq(ProdOrder::getStatus, status.trim());
        }
        if (productId != null) {
            wrapper.eq(ProdOrder::getProductId, productId);
        }
        if (startDate != null) {
            wrapper.ge(ProdOrder::getPlanStart, startDate.atStartOfDay());
        }
        if (endDate != null) {
            wrapper.lt(ProdOrder::getPlanStart, endDate.plusDays(1).atStartOfDay());
        }

        wrapper.orderByDesc(ProdOrder::getCreatedAt);
        Page<ProdOrder> result = prodOrderMapper.selectPage(page, wrapper);

        List<ProdOrderResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<ProdOrderResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());
        return R.ok(pageResponse);
    }

    public R<ProdOrderResponse> getById(Long id) {
        return R.ok(convertToResponse(requireOrder(id)));
    }

    private ProdOrder requireOrder(Long id) {
        ProdOrder prodOrder = prodOrderMapper.selectById(id);
        if (prodOrder == null) {
            throw new com.injectmes.exception.BusinessException("生产工单不存在");
        }
        return prodOrder;
    }

    private ProdOrderResponse convertToResponse(ProdOrder prodOrder) {
        ProdOrderResponse response = new ProdOrderResponse();
        BeanUtils.copyProperties(prodOrder, response);

        if (prodOrder.getProductId() != null) {
            Product product = productMapper.selectById(prodOrder.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }

        if (prodOrder.getMachineId() != null) {
            Machine machine = machineMapper.selectById(prodOrder.getMachineId());
            if (machine != null) {
                response.setMachineName(machine.getName());
            }
        }

        if (prodOrder.getMoldId() != null) {
            Mold mold = moldMapper.selectById(prodOrder.getMoldId());
            if (mold != null) {
                response.setMoldName(mold.getName());
            }
        }

        return response;
    }
}
