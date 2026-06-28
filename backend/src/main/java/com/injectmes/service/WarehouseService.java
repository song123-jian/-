package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.WarehouseCreateRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.WarehouseResponse;
import com.injectmes.entity.SysUser;
import com.injectmes.entity.Warehouse;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.SysUserMapper;
import com.injectmes.mapper.WarehouseMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 仓库服务
 */
@Service
public class WarehouseService {

    @Autowired
    private WarehouseMapper warehouseMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 分页查询仓库列表
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<WarehouseResponse>> list(PageRequest request) {
        Page<Warehouse> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Warehouse> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(Warehouse::getCode, keyword)
                    .or().like(Warehouse::getName, keyword)
                    .or().like(Warehouse::getAddress, keyword)
                    .or().like(Warehouse::getFactoryCode, keyword)
                    .or().like(Warehouse::getWorkshop, keyword)
            );
        }
        if (request.getType() != null && !request.getType().trim().isEmpty()) {
            wrapper.eq(Warehouse::getType, request.getType().trim());
        }
        if (request.getFactoryCode() != null && !request.getFactoryCode().trim().isEmpty()) {
            wrapper.eq(Warehouse::getFactoryCode, request.getFactoryCode().trim());
        }
        if (request.getWorkshop() != null && !request.getWorkshop().trim().isEmpty()) {
            wrapper.like(Warehouse::getWorkshop, request.getWorkshop().trim());
        }
        if (request.getStatus() != null && !request.getStatus().trim().isEmpty()) {
            wrapper.eq(Warehouse::getIsEnabled, "1".equals(request.getStatus().trim()) ? 1 : 0);
        }

        // 按创建时间降序
        wrapper.orderByDesc(Warehouse::getCreatedAt);

        Page<Warehouse> result = warehouseMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<WarehouseResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<WarehouseResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 查询仓库详情
     *
     * @param id 仓库ID
     * @return 仓库响应
     */
    public R<WarehouseResponse> getById(Long id) {
        Warehouse warehouse = warehouseMapper.selectById(id);
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }
        return R.ok(convertToResponse(warehouse));
    }

    /**
     * 创建仓库
     *
     * @param request 创建仓库请求
     * @return 仓库响应
     */
    @Transactional
    public R<WarehouseResponse> create(WarehouseCreateRequest request) {
        // 检查编码是否已存在
        Long count = warehouseMapper.selectCount(
                new LambdaQueryWrapper<Warehouse>().eq(Warehouse::getCode, request.getCode())
        );
        if (count > 0) {
            throw new BusinessException("仓库编码已存在");
        }

        Warehouse warehouse = new Warehouse();
        BeanUtils.copyProperties(request, warehouse);
        if (warehouse.getIsEnabled() == null) {
            warehouse.setIsEnabled(1);
        }
        warehouse.setCreatedAt(LocalDateTime.now());

        warehouseMapper.insert(warehouse);

        return R.ok("创建成功", convertToResponse(warehouse));
    }

    /**
     * 更新仓库
     *
     * @param id      仓库ID
     * @param request 更新仓库请求
     * @return 仓库响应
     */
    @Transactional
    public R<WarehouseResponse> update(Long id, WarehouseCreateRequest request) {
        Warehouse warehouse = warehouseMapper.selectById(id);
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        // 检查编码是否与其他仓库重复
        Long count = warehouseMapper.selectCount(
                new LambdaQueryWrapper<Warehouse>()
                        .eq(Warehouse::getCode, request.getCode())
                        .ne(Warehouse::getId, id)
        );
        if (count > 0) {
            throw new BusinessException("仓库编码已存在");
        }

        if (request.getCode() != null) {
            warehouse.setCode(request.getCode());
        }
        if (request.getName() != null) {
            warehouse.setName(request.getName());
        }
        if (request.getType() != null) {
            warehouse.setType(request.getType());
        }
        if (request.getAddress() != null) {
            warehouse.setAddress(request.getAddress());
        }
        if (request.getFactoryCode() != null) {
            warehouse.setFactoryCode(request.getFactoryCode());
        }
        if (request.getWorkshop() != null) {
            warehouse.setWorkshop(request.getWorkshop());
        }
        if (request.getManagerId() != null) {
            warehouse.setManagerId(request.getManagerId());
        }

        warehouseMapper.updateById(warehouse);

        return R.ok("更新成功", convertToResponse(warehouse));
    }

    /**
     * 删除仓库
     *
     * @param id 仓库ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> delete(Long id) {
        Warehouse warehouse = warehouseMapper.selectById(id);
        if (warehouse == null) {
            throw new BusinessException("仓库不存在");
        }

        warehouseMapper.deleteById(id);

        return R.ok("删除成功", null);
    }

    /**
     * 实体转响应DTO
     */
    private WarehouseResponse convertToResponse(Warehouse warehouse) {
        WarehouseResponse response = new WarehouseResponse();
        BeanUtils.copyProperties(warehouse, response);
        // 设置状态
        if (warehouse.getIsEnabled() != null) {
            response.setStatus(warehouse.getIsEnabled() == 1 ? "启用" : "禁用");
        }
        // 查询管理员名称
        if (warehouse.getManagerId() != null) {
            SysUser user = sysUserMapper.selectById(warehouse.getManagerId());
            if (user != null) {
                response.setManagerName(user.getRealName());
            }
        }
        return response;
    }
}
