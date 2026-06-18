package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.WarehouseLocationCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.WarehouseLocationResponse;
import com.injectmes.entity.Warehouse;
import com.injectmes.entity.WarehouseLocation;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.WarehouseLocationMapper;
import com.injectmes.mapper.WarehouseMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 库位服务
 */
@Service
public class WarehouseLocationService {

    @Autowired
    private WarehouseLocationMapper warehouseLocationMapper;

    @Autowired
    private WarehouseMapper warehouseMapper;

    /**
     * 按仓库查询库位列表（分页）
     *
     * @param warehouseId 仓库ID
     * @param request     分页请求
     * @return 分页响应
     */
    public R<PageResponse<WarehouseLocationResponse>> list(Long warehouseId, PageRequest request) {
        Page<WarehouseLocation> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<WarehouseLocation> wrapper = new LambdaQueryWrapper<>();

        // 按仓库筛选
        if (warehouseId != null) {
            wrapper.eq(WarehouseLocation::getWarehouseId, warehouseId);
        }

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(WarehouseLocation::getCode, keyword)
                    .or().like(WarehouseLocation::getName, keyword)
            );
        }

        Page<WarehouseLocation> result = warehouseLocationMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<WarehouseLocationResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<WarehouseLocationResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 创建库位
     *
     * @param request 创建库位请求
     * @return 库位响应
     */
    @Transactional
    public R<WarehouseLocationResponse> create(WarehouseLocationCreateRequest request) {
        // 校验仓库是否存在
        Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查编码是否已存在
        Long count = warehouseLocationMapper.selectCount(
                new LambdaQueryWrapper<WarehouseLocation>().eq(WarehouseLocation::getCode, request.getCode())
        );
        if (count > 0) {
            throw new BusinessException("库位编码已存在");
        }

        WarehouseLocation location = new WarehouseLocation();
        BeanUtils.copyProperties(request, location);
        // 处理layer和position类型转换（DTO为String，Entity为Integer）
        if (request.getLayer() != null) {
            try {
                location.setLayer(Integer.valueOf(request.getLayer()));
            } catch (NumberFormatException e) {
                location.setLayer(null);
            }
        }
        if (request.getPosition() != null) {
            try {
                location.setPosition(Integer.valueOf(request.getPosition()));
            } catch (NumberFormatException e) {
                location.setPosition(null);
            }
        }
        if (location.getIsEnabled() == null) {
            location.setIsEnabled(1);
        }

        warehouseLocationMapper.insert(location);

        return R.ok("创建成功", convertToResponse(location));
    }

    /**
     * 更新库位
     *
     * @param id      库位ID
     * @param request 更新库位请求
     * @return 库位响应
     */
    @Transactional
    public R<WarehouseLocationResponse> update(Long id, WarehouseLocationCreateRequest request) {
        WarehouseLocation location = warehouseLocationMapper.selectById(id);
        if (location == null) {
            throw new BusinessException("库位不存在");
        }

        // 检查编码是否与其他库位重复
        Long count = warehouseLocationMapper.selectCount(
                new LambdaQueryWrapper<WarehouseLocation>()
                        .eq(WarehouseLocation::getCode, request.getCode())
                        .ne(WarehouseLocation::getId, id)
        );
        if (count > 0) {
            throw new BusinessException("库位编码已存在");
        }

        if (request.getWarehouseId() != null) {
            // 校验仓库是否存在
            Warehouse warehouse = warehouseMapper.selectById(request.getWarehouseId());
            if (warehouse == null) {
                throw new BusinessException("仓库不存在");
            }
            location.setWarehouseId(request.getWarehouseId());
        }
        if (request.getCode() != null) {
            location.setCode(request.getCode());
        }
        if (request.getName() != null) {
            location.setName(request.getName());
        }
        if (request.getArea() != null) {
            location.setArea(request.getArea());
        }
        if (request.getShelf() != null) {
            location.setShelf(request.getShelf());
        }
        if (request.getLayer() != null) {
            try {
                location.setLayer(Integer.valueOf(request.getLayer()));
            } catch (NumberFormatException e) {
                location.setLayer(null);
            }
        }
        if (request.getPosition() != null) {
            try {
                location.setPosition(Integer.valueOf(request.getPosition()));
            } catch (NumberFormatException e) {
                location.setPosition(null);
            }
        }

        warehouseLocationMapper.updateById(location);

        return R.ok("更新成功", convertToResponse(location));
    }

    /**
     * 删除库位
     *
     * @param id 库位ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> delete(Long id) {
        WarehouseLocation location = warehouseLocationMapper.selectById(id);
        if (location == null) {
            throw new BusinessException("库位不存在");
        }

        warehouseLocationMapper.deleteById(id);

        return R.ok("删除成功", null);
    }

    /**
     * 实体转响应DTO
     */
    private WarehouseLocationResponse convertToResponse(WarehouseLocation location) {
        WarehouseLocationResponse response = new WarehouseLocationResponse();
        BeanUtils.copyProperties(location, response);
        // 设置状态
        if (location.getIsEnabled() != null) {
            response.setStatus(location.getIsEnabled() == 1 ? "启用" : "禁用");
        }
        // layer和position类型转换
        if (location.getLayer() != null) {
            response.setLayer(String.valueOf(location.getLayer()));
        }
        if (location.getPosition() != null) {
            response.setPosition(String.valueOf(location.getPosition()));
        }
        // 查询仓库名称
        if (location.getWarehouseId() != null) {
            Warehouse warehouse = warehouseMapper.selectById(location.getWarehouseId());
            if (warehouse != null) {
                response.setWarehouseName(warehouse.getName());
            }
        }
        return response;
    }
}
