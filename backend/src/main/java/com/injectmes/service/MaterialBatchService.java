package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.MaterialBatchCreateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MaterialBatchResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.MaterialBatch;
import com.injectmes.entity.Product;
import com.injectmes.entity.Supplier;
import com.injectmes.entity.Warehouse;
import com.injectmes.enums.BatchStatus;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MaterialBatchMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.mapper.SupplierMapper;
import com.injectmes.mapper.WarehouseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 物料批次服务
 */
@Service
public class MaterialBatchService {

    @Autowired
    private MaterialBatchMapper materialBatchMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private WarehouseMapper warehouseMapper;

    @Autowired
    private SupplierMapper supplierMapper;

    @Autowired
    private SeqNumberService seqNumberService;

    /**
     * 分页查询批次列表（支持productId/warehouseId筛选）
     *
     * @param request    分页请求
     * @return 分页响应
     */
    public R<PageResponse<MaterialBatchResponse>> list(PageRequest request) {
        Page<MaterialBatch> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<MaterialBatch> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索（批次号）
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(MaterialBatch::getBatchNo, keyword);
        }

        // 按创建时间降序
        wrapper.orderByDesc(MaterialBatch::getCreatedAt);

        Page<MaterialBatch> result = materialBatchMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<MaterialBatchResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<MaterialBatchResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 创建批次（自动生成批次号：R-YYYYMMDD-3位序号）
     *
     * @param request 创建批次请求
     * @return 批次响应
     */
    @Transactional
    public R<MaterialBatchResponse> create(MaterialBatchCreateRequest request) {
        // 校验产品是否存在
        Product product = productMapper.selectById(request.getProductId());
        if (product == null) {
            throw new BusinessException("产品不存在");
        }

        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        MaterialBatch batch = new MaterialBatch();
        batch.setProductId(request.getProductId());
        batch.setWarehouseId(request.getWarehouseId());
        batch.setSupplierId(request.getSupplierId());
        batch.setProductionDate(request.getProductionDate());
        batch.setExpiryDate(request.getExpiryDate());
        // 数量转换：BigDecimal -> Integer
        if (request.getInitialQty() != null) {
            batch.setInitialQty(request.getInitialQty().intValue());
            batch.setRemainingQty(request.getInitialQty().intValue());
        }
        batch.setStatus(BatchStatus.NORMAL.name());
        batch.setCreatedAt(LocalDateTime.now());

        // 自动生成批次号：R-YYYYMMDD-3位序号
        String batchNo = generateBatchNo();
        batch.setBatchNo(batchNo);

        materialBatchMapper.insert(batch);

        return R.ok("创建成功", convertToResponse(batch));
    }

    /**
     * 查询批次详情
     *
     * @param id 批次ID
     * @return 批次响应
     */
    public R<MaterialBatchResponse> getById(Long id) {
        MaterialBatch batch = materialBatchMapper.selectById(id);
        if (batch == null) {
            throw new BusinessException("批次不存在");
        }
        return R.ok(convertToResponse(batch));
    }

    /**
     * 自动生成批次号：R-YYYYMMDD-3位序号
     */
    private String generateBatchNo() {
        return seqNumberService.generateBatchNo();
    }

    /**
     * 实体转响应DTO
     */
    private MaterialBatchResponse convertToResponse(MaterialBatch batch) {
        MaterialBatchResponse response = new MaterialBatchResponse();
        response.setId(batch.getId());
        response.setBatchNo(batch.getBatchNo());
        response.setProductId(batch.getProductId());
        response.setWarehouseId(batch.getWarehouseId());
        response.setSupplierId(batch.getSupplierId());
        response.setProductionDate(batch.getProductionDate());
        response.setExpiryDate(batch.getExpiryDate());
        // 数量转换：Integer -> BigDecimal
        if (batch.getInitialQty() != null) {
            response.setInitialQty(BigDecimal.valueOf(batch.getInitialQty()));
        }
        if (batch.getRemainingQty() != null) {
            response.setCurrentQty(BigDecimal.valueOf(batch.getRemainingQty()));
        }
        response.setStatus(batch.getStatus());
        response.setCreatedAt(batch.getCreatedAt());

        // 查询产品名称
        if (batch.getProductId() != null) {
            Product product = productMapper.selectById(batch.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }
        // 查询仓库名称
        if (batch.getWarehouseId() != null) {
            Warehouse warehouse = warehouseMapper.selectById(batch.getWarehouseId());
            if (warehouse != null) {
                response.setWarehouseName(warehouse.getName());
            }
        }
        // 查询供应商名称
        if (batch.getSupplierId() != null) {
            Supplier supplier = supplierMapper.selectById(batch.getSupplierId());
            if (supplier != null) {
                response.setSupplierName(supplier.getName());
            }
        }

        return response;
    }
}
