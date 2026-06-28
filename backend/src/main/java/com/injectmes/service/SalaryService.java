package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.PiecePriceRequest;
import com.injectmes.dto.req.SalaryAdjustRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.PiecePriceResponse;
import com.injectmes.dto.resp.SalaryAdjustResponse;
import com.injectmes.dto.resp.SalaryDailyResponse;
import com.injectmes.entity.*;
import com.injectmes.enums.AdjustType;
import com.injectmes.enums.SalaryStatus;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.*;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工资服务
 */
@Service
public class SalaryService {

    @Autowired
    private PiecePriceMapper piecePriceMapper;

    @Autowired
    private SalaryDailyMapper salaryDailyMapper;

    @Autowired
    private SalaryAdjustMapper salaryAdjustMapper;

    @Autowired
    private ProdReportMapper prodReportMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 计件单价列表（分页，支持productId筛选）
     */
    public R<PageResponse<PiecePriceResponse>> listPrices(PageRequest request, Long productId) {
        Page<PiecePrice> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<PiecePrice> wrapper = new LambdaQueryWrapper<>();
        // 产品ID筛选
        if (productId != null) {
            wrapper.eq(PiecePrice::getProductId, productId);
        }
        // 关键词搜索工序名称
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.like(PiecePrice::getProcessName, keyword);
        }
        wrapper.orderByDesc(PiecePrice::getCreatedAt);

        Page<PiecePrice> result = piecePriceMapper.selectPage(page, wrapper);

        List<PiecePriceResponse> records = result.getRecords().stream()
                .map(this::convertPriceToResponse)
                .collect(Collectors.toList());

        PageResponse<PiecePriceResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 设置计件单价
     */
    @Transactional
    public R<PiecePriceResponse> setPrice(PiecePriceRequest request) {
        PiecePrice piecePrice = new PiecePrice();
        BeanUtils.copyProperties(request, piecePrice);
        piecePrice.setCreatedAt(LocalDateTime.now());
        piecePriceMapper.insert(piecePrice);

        return R.ok(convertPriceToResponse(piecePrice));
    }

    /**
     * 日工资列表（分页，支持userId/日期范围筛选）
     */
    public R<PageResponse<SalaryDailyResponse>> listDaily(PageRequest request, Long userId,
                                                           LocalDate startDate, LocalDate endDate) {
        Page<SalaryDaily> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<SalaryDaily> wrapper = new LambdaQueryWrapper<>();
        // 用户ID筛选
        if (userId != null) {
            wrapper.eq(SalaryDaily::getUserId, userId);
        }
        // 日期范围筛选
        if (startDate != null) {
            wrapper.ge(SalaryDaily::getWorkDate, startDate);
        }
        if (endDate != null) {
            wrapper.le(SalaryDaily::getWorkDate, endDate);
        }
        wrapper.orderByDesc(SalaryDaily::getCreatedAt);

        Page<SalaryDaily> result = salaryDailyMapper.selectPage(page, wrapper);

        List<SalaryDailyResponse> records = result.getRecords().stream()
                .map(this::convertDailyToResponse)
                .collect(Collectors.toList());

        PageResponse<SalaryDailyResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 计算日工资（核心算法，严格按技术文档9节）
     * 1. 取当日该员工所有报工记录（prod_report）
     * 2. 按工单分组，汇总每个工单的合格品数量 = qty - bad_qty
     * 3. 查询对应产品的当前计件单价（piece_price，取effective_date <= 当日 AND (expire_date IS NULL OR expire_date > 当日)的最新记录）
     * 4. 计算计件工资 = Σ(合格品数量 × 计件单价)
     * 5. 加上当日补贴/扣款（salary_adjust）
     * 6. 写入 salary_daily
     */
    @Transactional
    public R<SalaryDailyResponse> calculateDaily(Long userId, LocalDate workDate) {
        // 1. 取当日该员工所有报工记录
        LocalDateTime dayStart = workDate.atStartOfDay();
        LocalDateTime dayEnd = workDate.plusDays(1).atStartOfDay();

        LambdaQueryWrapper<ProdReport> reportWrapper = new LambdaQueryWrapper<>();
        reportWrapper.eq(ProdReport::getUserId, userId);
        reportWrapper.ge(ProdReport::getCreatedAt, dayStart);
        reportWrapper.lt(ProdReport::getCreatedAt, dayEnd);
        List<ProdReport> reports = prodReportMapper.selectList(reportWrapper);

        if (reports.isEmpty()) {
            throw new BusinessException("该员工当日无报工记录");
        }

        // 2. 按工单分组，汇总每个工单的合格品数量
        // 跨班次工单：同一工单日夜班分别报工，按班次分别计算
        // 多人同机台：同一机台同一班次可能有多人，按各自报工数量分别计算
        Map<Long, List<ProdReport>> orderGroupMap = reports.stream()
                .collect(Collectors.groupingBy(ProdReport::getProdOrderId));

        int totalQualifiedQty = 0;
        BigDecimal totalPieceAmount = BigDecimal.ZERO;

        for (Map.Entry<Long, List<ProdReport>> entry : orderGroupMap.entrySet()) {
            Long prodOrderId = entry.getKey();
            List<ProdReport> orderReports = entry.getValue();

            // 查询工单获取产品ID
            ProdOrder prodOrder = prodOrderMapper.selectById(prodOrderId);
            if (prodOrder == null) {
                continue;
            }
            Long productId = prodOrder.getProductId();

            // 汇总该工单的合格品数量（按班次分别报工，此处汇总同一工单下该员工的所有合格品）
            int qualifiedQty = orderReports.stream()
                    .mapToInt(r -> {
                        // 合格品数 = 报工产量 - 不良数量
                        int qty = r.getQty() != null ? r.getQty() : 0;
                        int badQty = r.getBadQty() != null ? r.getBadQty() : 0;
                        return qty - badQty;
                    })
                    .sum();

            // 3. 查询对应产品的当前计件单价
            // 取 effective_date <= 当日 AND (expire_date IS NULL OR expire_date > 当日) 的最新记录
            LambdaQueryWrapper<PiecePrice> priceWrapper = new LambdaQueryWrapper<>();
            priceWrapper.eq(PiecePrice::getProductId, productId);
            priceWrapper.le(PiecePrice::getEffectiveDate, workDate);
            priceWrapper.and(w -> w.isNull(PiecePrice::getExpireDate)
                    .or().gt(PiecePrice::getExpireDate, workDate));
            priceWrapper.orderByDesc(PiecePrice::getEffectiveDate);
            priceWrapper.last("LIMIT 1");
            PiecePrice piecePrice = piecePriceMapper.selectOne(priceWrapper);

            if (piecePrice == null) {
                // 无计件单价记录，跳过该工单
                continue;
            }

            // 4. 计算计件工资 = 合格品数量 × 计件单价
            BigDecimal pieceAmount = piecePrice.getPrice().multiply(BigDecimal.valueOf(qualifiedQty));
            totalQualifiedQty += qualifiedQty;
            totalPieceAmount = totalPieceAmount.add(pieceAmount);
        }

        // 5. 加上当日补贴/扣款（salary_adjust）
        LambdaQueryWrapper<SalaryAdjust> adjustWrapper = new LambdaQueryWrapper<>();
        adjustWrapper.eq(SalaryAdjust::getUserId, userId);
        adjustWrapper.eq(SalaryAdjust::getAdjustDate, workDate);
        List<SalaryAdjust> adjusts = salaryAdjustMapper.selectList(adjustWrapper);

        BigDecimal subsidy = BigDecimal.ZERO;
        BigDecimal deduction = BigDecimal.ZERO;
        for (SalaryAdjust adjust : adjusts) {
            if (AdjustType.BONUS.name().equals(adjust.getAdjustType())
                    || AdjustType.OVERTIME.name().equals(adjust.getAdjustType())
                    || AdjustType.SUBSIDY.name().equals(adjust.getAdjustType())) {
                subsidy = subsidy.add(adjust.getAmount());
            } else if (AdjustType.PENALTY.name().equals(adjust.getAdjustType())) {
                deduction = deduction.add(adjust.getAmount());
            } else {
                // OTHER类型：正数为补贴，负数为扣款
                if (adjust.getAmount().compareTo(BigDecimal.ZERO) >= 0) {
                    subsidy = subsidy.add(adjust.getAmount());
                } else {
                    deduction = deduction.add(adjust.getAmount().abs());
                }
            }
        }

        // 6. 写入 salary_daily
        // 日工资 = Σ(工单合格品数_i × 产品计件单价_i) + Σ(当日补贴) - Σ(当日扣款)
        BigDecimal totalAmount = totalPieceAmount.add(subsidy).subtract(deduction);

        // 检查是否已有当日记录，有则更新
        LambdaQueryWrapper<SalaryDaily> dailyWrapper = new LambdaQueryWrapper<>();
        dailyWrapper.eq(SalaryDaily::getUserId, userId);
        dailyWrapper.eq(SalaryDaily::getWorkDate, workDate);
        SalaryDaily existing = salaryDailyMapper.selectOne(dailyWrapper);

        SalaryDaily salaryDaily;
        if (existing != null) {
            existing.setTotalQualifiedQty(totalQualifiedQty);
            existing.setTotalPieceAmount(totalPieceAmount);
            existing.setSubsidy(subsidy);
            existing.setDeduction(deduction);
            existing.setTotalAmount(totalAmount);
            salaryDailyMapper.updateById(existing);
            salaryDaily = existing;
        } else {
            salaryDaily = new SalaryDaily();
            salaryDaily.setUserId(userId);
            salaryDaily.setWorkDate(workDate);
            salaryDaily.setTotalQualifiedQty(totalQualifiedQty);
            salaryDaily.setTotalPieceAmount(totalPieceAmount);
            salaryDaily.setSubsidy(subsidy);
            salaryDaily.setDeduction(deduction);
            salaryDaily.setTotalAmount(totalAmount);
            salaryDaily.setStatus(SalaryStatus.DRAFT.name());
            salaryDaily.setCreatedAt(LocalDateTime.now());
            salaryDailyMapper.insert(salaryDaily);
        }

        return R.ok(convertDailyToResponse(salaryDaily));
    }

    /**
     * 月工资汇总
     * 月工资 = Σ(当月每日日工资) + 月度奖惩 + 全勤奖 - 社保代扣 - 个税
     */
    public R<Map<String, Object>> monthlySummary(Long userId, String month) {
        // 解析月份，格式：yyyy-MM
        YearMonth yearMonth = parseYearMonth(month);
        LocalDate monthStart = LocalDate.of(yearMonth.year, yearMonth.month, 1);
        LocalDate monthEnd = monthStart.plusMonths(1);

        // 查询当月每日日工资
        LambdaQueryWrapper<SalaryDaily> dailyWrapper = new LambdaQueryWrapper<>();
        dailyWrapper.eq(SalaryDaily::getUserId, userId);
        dailyWrapper.ge(SalaryDaily::getWorkDate, monthStart);
        dailyWrapper.lt(SalaryDaily::getWorkDate, monthEnd);
        List<SalaryDaily> dailyList = salaryDailyMapper.selectList(dailyWrapper);

        // Σ(当月每日日工资)
        BigDecimal dailyTotal = dailyList.stream()
                .map(SalaryDaily::getTotalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 查询月度奖惩
        LambdaQueryWrapper<SalaryAdjust> adjustWrapper = new LambdaQueryWrapper<>();
        adjustWrapper.eq(SalaryAdjust::getUserId, userId);
        adjustWrapper.ge(SalaryAdjust::getAdjustDate, monthStart);
        adjustWrapper.lt(SalaryAdjust::getAdjustDate, monthEnd);
        List<SalaryAdjust> monthAdjusts = salaryAdjustMapper.selectList(adjustWrapper);

        BigDecimal monthBonus = BigDecimal.ZERO;
        BigDecimal monthPenalty = BigDecimal.ZERO;
        for (SalaryAdjust adjust : monthAdjusts) {
            if (AdjustType.BONUS.name().equals(adjust.getAdjustType())
                    || AdjustType.OVERTIME.name().equals(adjust.getAdjustType())
                    || AdjustType.SUBSIDY.name().equals(adjust.getAdjustType())) {
                monthBonus = monthBonus.add(adjust.getAmount());
            } else if (AdjustType.PENALTY.name().equals(adjust.getAdjustType())) {
                monthPenalty = monthPenalty.add(adjust.getAmount());
            } else {
                if (adjust.getAmount().compareTo(BigDecimal.ZERO) >= 0) {
                    monthBonus = monthBonus.add(adjust.getAmount());
                } else {
                    monthPenalty = monthPenalty.add(adjust.getAmount().abs());
                }
            }
        }

        // 出勤天数
        long workDays = dailyList.stream()
                .map(SalaryDaily::getWorkDate)
                .distinct()
                .count();

        // 全勤奖（当月工作天数 >= 22天视为全勤，全勤奖500元）
        BigDecimal fullAttendanceBonus = BigDecimal.ZERO;
        if (workDays >= 22) {
            fullAttendanceBonus = new BigDecimal("500");
        }

        // 社保代扣（固定值，实际应从配置读取）
        BigDecimal socialInsurance = new BigDecimal("0");

        // 个税（简化计算，实际应按个税累进税率）
        BigDecimal incomeTax = BigDecimal.ZERO;

        // 月工资 = Σ(当月每日日工资) + 月度奖惩 + 全勤奖 - 社保代扣 - 个税
        BigDecimal monthlySalary = dailyTotal
                .add(monthBonus)
                .subtract(monthPenalty)
                .add(fullAttendanceBonus)
                .subtract(socialInsurance)
                .subtract(incomeTax);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", userId);
        result.put("month", month);
        result.put("dailyTotal", dailyTotal);
        result.put("workDays", workDays);
        result.put("monthBonus", monthBonus);
        result.put("monthPenalty", monthPenalty);
        result.put("fullAttendanceBonus", fullAttendanceBonus);
        result.put("socialInsurance", socialInsurance);
        result.put("incomeTax", incomeTax);
        result.put("monthlySalary", monthlySalary);

        return R.ok(result);
    }

    /**
     * 奖惩登记
     */
    @Transactional
    public R<SalaryAdjustResponse> adjust(SalaryAdjustRequest request) {
        SalaryAdjust salaryAdjust = new SalaryAdjust();
        BeanUtils.copyProperties(request, salaryAdjust);
        salaryAdjust.setCreatedAt(LocalDateTime.now());
        salaryAdjustMapper.insert(salaryAdjust);

        return R.ok(convertAdjustToResponse(salaryAdjust));
    }

    /**
     * 奖惩列表（分页，支持userId/adjustType筛选）
     */
    public R<PageResponse<SalaryAdjustResponse>> listAdjusts(PageRequest request, Long userId, String adjustType) {
        Page<SalaryAdjust> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<SalaryAdjust> wrapper = new LambdaQueryWrapper<>();
        // 用户ID筛选
        if (userId != null) {
            wrapper.eq(SalaryAdjust::getUserId, userId);
        }
        // 调整类型筛选
        if (adjustType != null && !adjustType.trim().isEmpty()) {
            wrapper.eq(SalaryAdjust::getAdjustType, adjustType);
        }
        wrapper.orderByDesc(SalaryAdjust::getCreatedAt);

        Page<SalaryAdjust> result = salaryAdjustMapper.selectPage(page, wrapper);

        List<SalaryAdjustResponse> records = result.getRecords().stream()
                .map(this::convertAdjustToResponse)
                .collect(Collectors.toList());

        PageResponse<SalaryAdjustResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 解析月份字符串
     */
    @Transactional
    public R<PiecePriceResponse> updatePrice(Long id, PiecePriceRequest request) {
        PiecePrice piecePrice = piecePriceMapper.selectById(id);
        if (piecePrice == null) {
            throw new BusinessException("计件单价不存在");
        }
        BeanUtils.copyProperties(request, piecePrice);
        piecePrice.setId(id);
        piecePriceMapper.updateById(piecePrice);
        return R.ok("更新成功", convertPriceToResponse(piecePrice));
    }

    @Transactional
    public R<Void> deletePrice(Long id) {
        PiecePrice piecePrice = piecePriceMapper.selectById(id);
        if (piecePrice == null) {
            throw new BusinessException("计件单价不存在");
        }
        piecePriceMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    @Transactional
    public R<SalaryAdjustResponse> updateAdjust(Long id, SalaryAdjustRequest request) {
        SalaryAdjust salaryAdjust = salaryAdjustMapper.selectById(id);
        if (salaryAdjust == null) {
            throw new BusinessException("奖惩记录不存在");
        }
        BeanUtils.copyProperties(request, salaryAdjust);
        salaryAdjust.setId(id);
        salaryAdjustMapper.updateById(salaryAdjust);
        return R.ok("更新成功", convertAdjustToResponse(salaryAdjust));
    }

    @Transactional
    public R<Void> deleteAdjust(Long id) {
        SalaryAdjust salaryAdjust = salaryAdjustMapper.selectById(id);
        if (salaryAdjust == null) {
            throw new BusinessException("奖惩记录不存在");
        }
        salaryAdjustMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    @Transactional
    public R<Void> monthlySettle(Long userId, String month) {
        monthlySummary(userId, month);
        YearMonth yearMonth = parseYearMonth(month);
        LocalDate monthStart = LocalDate.of(yearMonth.year, yearMonth.month, 1);
        LocalDate monthEnd = monthStart.plusMonths(1);

        LambdaQueryWrapper<SalaryDaily> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SalaryDaily::getUserId, userId);
        wrapper.ge(SalaryDaily::getWorkDate, monthStart);
        wrapper.lt(SalaryDaily::getWorkDate, monthEnd);
        wrapper.eq(SalaryDaily::getStatus, SalaryStatus.DRAFT.name());

        List<SalaryDaily> dailyList = salaryDailyMapper.selectList(wrapper);
        for (SalaryDaily daily : dailyList) {
            daily.setStatus(SalaryStatus.SETTLED.name());
            salaryDailyMapper.updateById(daily);
        }
        return R.ok("结算成功", null);
    }

    private YearMonth parseYearMonth(String month) {
        try {
            String[] parts = month.split("-");
            int year = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            return new YearMonth(year, m);
        } catch (Exception e) {
            throw new BusinessException("月份格式错误，应为yyyy-MM");
        }
    }

    /**
     * 年月内部类
     */
    private static class YearMonth {
        int year;
        int month;

        YearMonth(int year, int month) {
            this.year = year;
            this.month = month;
        }
    }

    /**
     * 计件单价实体转响应DTO
     */
    private PiecePriceResponse convertPriceToResponse(PiecePrice piecePrice) {
        PiecePriceResponse response = new PiecePriceResponse();
        BeanUtils.copyProperties(piecePrice, response);

        // 查询产品名称
        if (piecePrice.getProductId() != null) {
            Product product = productMapper.selectById(piecePrice.getProductId());
            if (product != null) {
                response.setProductName(product.getName());
            }
        }

        return response;
    }

    /**
     * 日工资实体转响应DTO
     */
    private SalaryDailyResponse convertDailyToResponse(SalaryDaily salaryDaily) {
        SalaryDailyResponse response = new SalaryDailyResponse();
        response.setId(salaryDaily.getId());
        response.setUserId(salaryDaily.getUserId());
        response.setWorkDate(salaryDaily.getWorkDate());
        response.setQty(salaryDaily.getTotalQualifiedQty());
        response.setPiecePrice(salaryDaily.getTotalPieceAmount());
        response.setPieceSalary(salaryDaily.getTotalPieceAmount());
        response.setStatus(salaryDaily.getStatus());
        response.setCreatedAt(salaryDaily.getCreatedAt());

        // 查询用户名和真实姓名
        if (salaryDaily.getUserId() != null) {
            SysUser user = sysUserMapper.selectById(salaryDaily.getUserId());
            if (user != null) {
                response.setUsername(user.getUsername());
                response.setRealName(user.getRealName());
            }
        }

        return response;
    }

    /**
     * 奖惩实体转响应DTO
     */
    private SalaryAdjustResponse convertAdjustToResponse(SalaryAdjust salaryAdjust) {
        SalaryAdjustResponse response = new SalaryAdjustResponse();
        BeanUtils.copyProperties(salaryAdjust, response);

        // 查询用户名和真实姓名
        if (salaryAdjust.getUserId() != null) {
            SysUser user = sysUserMapper.selectById(salaryAdjust.getUserId());
            if (user != null) {
                response.setUsername(user.getUsername());
                response.setRealName(user.getRealName());
            }
        }

        return response;
    }
}
