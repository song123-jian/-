package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.MoldCreateRequest;
import com.injectmes.dto.req.MoldUpdateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MoldResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.Mold;
import com.injectmes.entity.Product;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MoldMapper;
import com.injectmes.mapper.ProductMapper;
import com.injectmes.security.LoginUserDetails;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 模具服务
 */
@Service
public class MoldService {

    @Autowired
    private MoldMapper moldMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private MoldMaintenanceRecordService moldMaintenanceRecordService;

    /**
     * 分页查询模具列表
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<MoldResponse>> list(PageRequest request, String status) {
        Page<Mold> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Mold> wrapper = new LambdaQueryWrapper<>();

        if (status != null && !status.trim().isEmpty()) {
            wrapper.eq(Mold::getStatus, status);
        }

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(Mold::getCode, keyword)
                    .or().like(Mold::getName, keyword)
            );
        }

        // 按创建时间降序
        wrapper.orderByDesc(Mold::getCreatedAt);

        Page<Mold> result = moldMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<MoldResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<MoldResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询模具
     *
     * @param id 模具ID
     * @return 模具响应
     */
    public R<MoldResponse> getById(Long id) {
        Mold mold = moldMapper.selectById(id);
        if (mold == null) {
            throw new BusinessException("模具不存在");
        }
        return R.ok(convertToResponse(mold));
    }

    /**
     * 创建模具
     *
     * @param request 创建模具请求
     * @return 模具响应
     */
    @Transactional
    public R<MoldResponse> create(MoldCreateRequest request) {
        // 检查编码是否已存在
        Long count = moldMapper.selectCount(
                new LambdaQueryWrapper<Mold>().eq(Mold::getCode, request.getCode())
        );
        if (count > 0) {
            throw new BusinessException("模具编码已存在");
        }

        Mold mold = new Mold();
        BeanUtils.copyProperties(request, mold);
        mold.setUsedShots(0);
        mold.setShotsSinceMaintenance(0);
        mold.setMaintenanceCount(0);
        mold.setStatus("NORMAL");
        mold.setCreatedAt(LocalDateTime.now());

        moldMapper.insert(mold);

        return R.ok("创建成功", convertToResponse(mold));
    }

    /**
     * 更新模具
     *
     * @param id      模具ID
     * @param request 更新模具请求
     * @return 模具响应
     */
    @Transactional
    public R<MoldResponse> update(Long id, MoldUpdateRequest request) {
        Mold mold = moldMapper.selectById(id);
        if (mold == null) {
            throw new BusinessException("模具不存在");
        }

        // 更新非空字段
        if (request.getName() != null) {
            mold.setName(request.getName());
        }
        if (request.getProductId() != null) {
            mold.setProductId(request.getProductId());
        }
        if (request.getCavities() != null) {
            mold.setCavities(request.getCavities());
        }
        if (request.getLifetime() != null) {
            mold.setLifetime(request.getLifetime());
        }
        if (request.getMaintenanceCycle() != null) {
            mold.setMaintenanceCycle(request.getMaintenanceCycle());
        }
        if (request.getStatus() != null) {
            mold.setStatus(request.getStatus());
        }
        if (request.getRemark() != null) {
            mold.setRemark(request.getRemark());
        }

        moldMapper.updateById(mold);

        return R.ok("更新成功", convertToResponse(mold));
    }

    /**
     * 执行保养
     *
     * @param id 模具ID
     * @return 模具响应
     */
    @Transactional
    public R<MoldResponse> maintenance(Long id) {
        Mold mold = moldMapper.selectById(id);
        if (mold == null) {
            throw new BusinessException("?????");
        }

        int usedShotsBefore = mold.getUsedShots() != null ? mold.getUsedShots() : 0;
        int shotsSinceMaintenanceBefore = mold.getShotsSinceMaintenance() != null
                ? mold.getShotsSinceMaintenance()
                : usedShotsBefore;
        int maintenanceCountBefore = mold.getMaintenanceCount() != null ? mold.getMaintenanceCount() : 0;
        LocalDateTime now = LocalDateTime.now();
        Long operatorId = getCurrentUserId();

        mold.setStatus("NORMAL");
        mold.setLastMaintenanceAt(now);
        mold.setShotsSinceMaintenance(0);
        mold.setMaintenanceCount(maintenanceCountBefore + 1);
        moldMapper.updateById(mold);
        moldMaintenanceRecordService.recordMaintenance(
                mold.getId(),
                operatorId,
                usedShotsBefore,
                shotsSinceMaintenanceBefore,
                maintenanceCountBefore,
                now,
                "????"
        );
        return R.ok("????", convertToResponse(mold));
    }

    @Transactional
    public R<Void> delete(Long id) {
        Mold mold = moldMapper.selectById(id);
        if (mold == null) {
            throw new BusinessException("模具不存在");
        }

        moldMapper.deleteById(id);

        return R.ok("删除成功", null);
    }

    /**
     * 模次统计
     * 返回模具的使用模次、寿命、剩余模次、使用率等信息
     *
     * @param id 模具ID
     * @return 模次统计信息
     */
    public R<Map<String, Object>> getShotsStats(Long id) {
        Mold mold = moldMapper.selectById(id);
        if (mold == null) {
            throw new BusinessException("模具不存在");
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("moldId", mold.getId());
        stats.put("moldCode", mold.getCode());
        stats.put("moldName", mold.getName());
        stats.put("usedShots", mold.getUsedShots() != null ? mold.getUsedShots() : 0);
        stats.put("shotsSinceMaintenance", mold.getShotsSinceMaintenance() != null ? mold.getShotsSinceMaintenance() : 0);
        stats.put("lifetime", mold.getLifetime() != null ? mold.getLifetime() : 0);
        stats.put("maintenanceCycle", mold.getMaintenanceCycle() != null ? mold.getMaintenanceCycle() : 0);
        stats.put("maintenanceCount", mold.getMaintenanceCount() != null ? mold.getMaintenanceCount() : 0);
        stats.put("lastMaintenanceAt", mold.getLastMaintenanceAt());

        // 计算剩余模次
        int lifetime = mold.getLifetime() != null ? mold.getLifetime() : 0;
        int usedShots = mold.getUsedShots() != null ? mold.getUsedShots() : 0;
        int remainingShots = Math.max(0, lifetime - usedShots);
        stats.put("remainingShots", remainingShots);

        // 计算使用率
        double usageRate = lifetime > 0 ? (double) usedShots / lifetime * 100 : 0;
        stats.put("usageRate", Math.round(usageRate * 100.0) / 100.0);

        // 计算距下次保养剩余模次
        int maintenanceCycle = mold.getMaintenanceCycle() != null ? mold.getMaintenanceCycle() : 0;
        if (maintenanceCycle > 0) {
            int shotsSinceLastMaintenance = mold.getShotsSinceMaintenance() != null
                    ? mold.getShotsSinceMaintenance()
                    : usedShots;
            int remainingToMaintenance = maintenanceCycle - (shotsSinceLastMaintenance % maintenanceCycle);
            if (remainingToMaintenance == maintenanceCycle) {
                remainingToMaintenance = 0;
            }
            stats.put("remainingToMaintenance", remainingToMaintenance);
            stats.put("maintenanceRate", Math.round(Math.min(100.0,
                    (double) shotsSinceLastMaintenance / maintenanceCycle * 100.0) * 100.0) / 100.0);
        } else {
            stats.put("remainingToMaintenance", 0);
            stats.put("maintenanceRate", 0D);
        }

        return R.ok(stats);
    }

    /**
     * 实体转响应DTO
     */

    private Long getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof LoginUserDetails userDetails) {
            return userDetails.getUserId();
        }
        return null;
    }
    private MoldResponse convertToResponse(Mold mold) {
        MoldResponse response = new MoldResponse();
        BeanUtils.copyProperties(mold, response);
        populateComputedFields(response, mold);
        return response;
    }

    private void populateComputedFields(MoldResponse response, Mold mold) {
        int lifetime = mold.getLifetime() != null ? mold.getLifetime() : 0;
        int usedShots = mold.getUsedShots() != null ? mold.getUsedShots() : 0;
        int shotsSinceMaintenance = mold.getShotsSinceMaintenance() != null ? mold.getShotsSinceMaintenance() : usedShots;
        int maintenanceCycle = mold.getMaintenanceCycle() != null ? mold.getMaintenanceCycle() : 0;

        response.setRemainingShots(Math.max(0, lifetime - usedShots));
        response.setUsageRate(lifetime > 0 ? Math.round(((double) usedShots / lifetime * 100.0) * 100.0) / 100.0 : 0D);
        response.setMaintenanceCount(mold.getMaintenanceCount() != null ? mold.getMaintenanceCount() : 0);
        response.setShotsSinceMaintenance(shotsSinceMaintenance);

        if (maintenanceCycle > 0) {
            int remainingToMaintenance = maintenanceCycle - (shotsSinceMaintenance % maintenanceCycle);
            if (remainingToMaintenance == maintenanceCycle) {
                remainingToMaintenance = 0;
            }
            response.setRemainingToMaintenance(remainingToMaintenance);
            response.setMaintenanceRate(Math.round(Math.min(100.0,
                    (double) shotsSinceMaintenance / maintenanceCycle * 100.0) * 100.0) / 100.0);
        } else {
            response.setRemainingToMaintenance(0);
            response.setMaintenanceRate(0D);
        }

        if (mold.getProductId() != null) {
            Product product = productMapper.selectById(mold.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }
    }
}
