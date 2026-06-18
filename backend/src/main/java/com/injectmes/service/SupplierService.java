package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.SupplierCreateRequest;
import com.injectmes.dto.req.SupplierUpdateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.SupplierResponse;
import com.injectmes.entity.Supplier;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.SupplierMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 供应商服务
 */
@Service
public class SupplierService {

    @Autowired
    private SupplierMapper supplierMapper;

    /**
     * 分页查询供应商列表
     * 支持keyword模糊搜索code/name
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<SupplierResponse>> list(PageRequest request) {
        Page<Supplier> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Supplier> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(Supplier::getCode, keyword)
                    .or().like(Supplier::getName, keyword)
            );
        }

        // 按创建时间降序
        wrapper.orderByDesc(Supplier::getCreatedAt);

        Page<Supplier> result = supplierMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<SupplierResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<SupplierResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询供应商
     *
     * @param id 供应商ID
     * @return 供应商响应
     */
    public R<SupplierResponse> getById(Long id) {
        Supplier supplier = supplierMapper.selectById(id);
        if (supplier == null) {
            throw new BusinessException("供应商不存在");
        }
        return R.ok(convertToResponse(supplier));
    }

    /**
     * 创建供应商
     *
     * @param request 创建供应商请求
     * @return 供应商响应
     */
    @Transactional
    public R<SupplierResponse> create(SupplierCreateRequest request) {
        // 检查编码是否已存在
        Long count = supplierMapper.selectCount(
                new LambdaQueryWrapper<Supplier>().eq(Supplier::getCode, request.getCode())
        );
        if (count > 0) {
            throw new BusinessException("供应商编码已存在");
        }

        Supplier supplier = new Supplier();
        BeanUtils.copyProperties(request, supplier);
        if (supplier.getStatus() == null) {
            supplier.setStatus(1);
        } else {
            supplier.setStatus(Integer.valueOf(request.getStatus()));
        }
        supplier.setCreatedAt(LocalDateTime.now());

        supplierMapper.insert(supplier);

        return R.ok("创建成功", convertToResponse(supplier));
    }

    /**
     * 更新供应商
     *
     * @param id      供应商ID
     * @param request 更新供应商请求
     * @return 供应商响应
     */
    @Transactional
    public R<SupplierResponse> update(Long id, SupplierUpdateRequest request) {
        Supplier supplier = supplierMapper.selectById(id);
        if (supplier == null) {
            throw new BusinessException("供应商不存在");
        }

        // 更新非空字段
        if (request.getName() != null) {
            supplier.setName(request.getName());
        }
        if (request.getContact() != null) {
            supplier.setContact(request.getContact());
        }
        if (request.getPhone() != null) {
            supplier.setPhone(request.getPhone());
        }
        if (request.getAddress() != null) {
            supplier.setAddress(request.getAddress());
        }
        if (request.getMainMaterial() != null) {
            supplier.setMainMaterial(request.getMainMaterial());
        }
        if (request.getStatus() != null) {
            supplier.setStatus(Integer.valueOf(request.getStatus()));
        }

        supplierMapper.updateById(supplier);

        return R.ok("更新成功", convertToResponse(supplier));
    }

    /**
     * 删除供应商
     *
     * @param id 供应商ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> delete(Long id) {
        Supplier supplier = supplierMapper.selectById(id);
        if (supplier == null) {
            throw new BusinessException("供应商不存在");
        }

        supplierMapper.deleteById(id);

        return R.ok("删除成功", null);
    }

    /**
     * 实体转响应DTO
     */
    private SupplierResponse convertToResponse(Supplier supplier) {
        SupplierResponse response = new SupplierResponse();
        BeanUtils.copyProperties(supplier, response);
        // status类型转换：Integer -> String
        if (supplier.getStatus() != null) {
            response.setStatus(String.valueOf(supplier.getStatus()));
        }
        return response;
    }
}
