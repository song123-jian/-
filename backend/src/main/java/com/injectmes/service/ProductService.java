package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.ProductCreateRequest;
import com.injectmes.dto.req.ProductUpdateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.ProductResponse;
import com.injectmes.entity.Product;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.ProductMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 产品服务
 */
@Service
public class ProductService {

    @Autowired
    private ProductMapper productMapper;

    /**
     * 分页查询产品列表
     * 支持type筛选、keyword模糊搜索code/name
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<ProductResponse>> list(PageRequest request) {
        Page<Product> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(Product::getCode, keyword)
                    .or().like(Product::getName, keyword)
                    .or().like(Product::getSpec, keyword)
            );
        }

        String type = request.getType();
        if (type != null && !type.trim().isEmpty()) {
            wrapper.eq(Product::getType, type.trim());
        }

        // 按创建时间降序
        wrapper.orderByDesc(Product::getCreatedAt);

        Page<Product> result = productMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<ProductResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<ProductResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询产品
     *
     * @param id 产品ID
     * @return 产品响应
     */
    public R<ProductResponse> getById(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }
        return R.ok(convertToResponse(product));
    }

    /**
     * 创建产品
     *
     * @param request 创建产品请求
     * @return 产品响应
     */
    @Transactional
    public R<ProductResponse> create(ProductCreateRequest request) {
        // 检查编码是否已存在
        Long count = productMapper.selectCount(
                new LambdaQueryWrapper<Product>().eq(Product::getCode, request.getCode())
        );
        if (count > 0) {
            throw new BusinessException("产品编码已存在");
        }

        Product product = new Product();
        BeanUtils.copyProperties(request, product);
        // cavityYield类型转换：BigDecimal -> Integer（实体中为Integer）
        if (request.getCavityYield() != null) {
            product.setCavityYield(request.getCavityYield().intValue());
        }
        if (product.getStatus() == null) {
            product.setStatus(1);
        } else {
            product.setStatus(Integer.valueOf(request.getStatus()));
        }
        product.setCreatedAt(LocalDateTime.now());

        productMapper.insert(product);

        return R.ok("创建成功", convertToResponse(product));
    }

    /**
     * 更新产品
     *
     * @param id      产品ID
     * @param request 更新产品请求
     * @return 产品响应
     */
    @Transactional
    public R<ProductResponse> update(Long id, ProductUpdateRequest request) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }

        // 更新非空字段
        if (request.getName() != null) {
            product.setName(request.getName());
        }
        if (request.getSpec() != null) {
            product.setSpec(request.getSpec());
        }
        if (request.getType() != null) {
            product.setType(request.getType());
        }
        if (request.getUnit() != null) {
            product.setUnit(request.getUnit());
        }
        if (request.getPiecePrice() != null) {
            product.setPiecePrice(request.getPiecePrice());
        }
        if (request.getCavityYield() != null) {
            product.setCavityYield(request.getCavityYield().intValue());
        }
        if (request.getCycleTimeSec() != null) {
            product.setCycleTimeSec(request.getCycleTimeSec());
        }
        if (request.getSafeStock() != null) {
            product.setSafeStock(request.getSafeStock());
        }
        if (request.getWeightG() != null) {
            product.setWeightG(request.getWeightG());
        }
        if (request.getRawMaterialId() != null) {
            product.setRawMaterialId(request.getRawMaterialId());
        }
        if (request.getRawMaterialUsage() != null) {
            product.setRawMaterialUsage(request.getRawMaterialUsage());
        }
        if (request.getColor() != null) {
            product.setColor(request.getColor());
        }
        if (request.getCustomerId() != null) {
            product.setCustomerId(request.getCustomerId());
        }
        if (request.getImageUrl() != null) {
            product.setImageUrl(request.getImageUrl());
        }
        if (request.getStatus() != null) {
            product.setStatus(Integer.valueOf(request.getStatus()));
        }

        productMapper.updateById(product);

        return R.ok("更新成功", convertToResponse(product));
    }

    /**
     * 删除产品
     *
     * @param id 产品ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> delete(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BusinessException("产品不存在");
        }

        productMapper.deleteById(id);

        return R.ok("删除成功", null);
    }

    /**
     * 实体转响应DTO
     */
    private ProductResponse convertToResponse(Product product) {
        ProductResponse response = new ProductResponse();
        BeanUtils.copyProperties(product, response);
        // cavityYield类型转换：Integer -> BigDecimal（响应中为BigDecimal）
        if (product.getCavityYield() != null) {
            response.setCavityYield(java.math.BigDecimal.valueOf(product.getCavityYield()));
        }
        // status类型转换：Integer -> String
        if (product.getStatus() != null) {
            response.setStatus(String.valueOf(product.getStatus()));
        }
        return response;
    }
}
