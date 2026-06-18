package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.req.PiecePriceRequest;
import com.injectmes.dto.req.SalaryAdjustRequest;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.dto.resp.PiecePriceResponse;
import com.injectmes.dto.resp.SalaryAdjustResponse;
import com.injectmes.dto.resp.SalaryDailyResponse;
import com.injectmes.entity.PiecePrice;
import com.injectmes.entity.SalaryAdjust;
import com.injectmes.entity.SalaryDaily;
import com.injectmes.enums.SalaryStatus;
import com.injectmes.mapper.PiecePriceMapper;
import com.injectmes.mapper.SalaryAdjustMapper;
import com.injectmes.mapper.SalaryDailyMapper;
import com.injectmes.service.SalaryService;
import jakarta.validation.Valid;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

/**
 * 工资管理控制器
 */
@RestController
@RequestMapping("/api/salary")
@Validated
public class SalaryController {

    @Autowired
    private SalaryService salaryService;

    @Autowired
    private PiecePriceMapper piecePriceMapper;

    @Autowired
    private SalaryAdjustMapper salaryAdjustMapper;

    @Autowired
    private SalaryDailyMapper salaryDailyMapper;

    /**
     * 计件单价列表
     */
    @GetMapping("/prices")
    public R<PageResponse<PiecePriceResponse>> listPrices(PageRequest request,
                                                           @RequestParam(required = false) Long productId) {
        return salaryService.listPrices(request, productId);
    }

    /**
     * 设置计件单价
     */
    @PostMapping("/prices")
    public R<PiecePriceResponse> setPrice(@Valid @RequestBody PiecePriceRequest request) {
        return salaryService.setPrice(request);
    }

    /**
     * 日工资列表
     */
    @GetMapping("/daily")
    public R<PageResponse<SalaryDailyResponse>> listDaily(PageRequest request,
                                                           @RequestParam(required = false) Long userId,
                                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return salaryService.listDaily(request, userId, startDate, endDate);
    }

    /**
     * 计算日工资
     */
    @PostMapping("/daily/calculate")
    public R<SalaryDailyResponse> calculateDaily(@RequestParam Long userId,
                                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate workDate) {
        return salaryService.calculateDaily(userId, workDate);
    }

    /**
     * 月工资汇总
     */
    @GetMapping("/monthly")
    public R<Map<String, Object>> monthlySummary(@RequestParam Long userId,
                                                   @RequestParam String month) {
        return salaryService.monthlySummary(userId, month);
    }

    /**
     * 奖惩登记
     */
    @PostMapping("/adjust")
    public R<SalaryAdjustResponse> adjust(@Valid @RequestBody SalaryAdjustRequest request) {
        return salaryService.adjust(request);
    }

    /**
     * 奖惩列表
     */
    @GetMapping("/adjusts")
    public R<PageResponse<SalaryAdjustResponse>> listAdjusts(PageRequest request,
                                                               @RequestParam(required = false) Long userId,
                                                               @RequestParam(required = false) String adjustType) {
        return salaryService.listAdjusts(request, userId, adjustType);
    }

    /**
     * 更新计件单价
     */
    @PutMapping("/prices/{id}")
    public R<Void> updatePrice(@PathVariable Long id, @Valid @RequestBody PiecePriceRequest request) {
        PiecePrice piecePrice = piecePriceMapper.selectById(id);
        if (piecePrice == null) {
            return R.fail("计件单价不存在");
        }
        BeanUtils.copyProperties(request, piecePrice);
        piecePrice.setId(id);
        piecePriceMapper.updateById(piecePrice);
        return R.ok("更新成功", null);
    }

    /**
     * 删除计件单价
     */
    @DeleteMapping("/prices/{id}")
    public R<Void> deletePrice(@PathVariable Long id) {
        piecePriceMapper.deleteById(id);
        return R.ok("删除成功", null);
    }

    /**
     * 月工资结算
     */
    @PostMapping("/monthly/settle")
    public R<Void> monthlySettle(@RequestParam Long userId, @RequestParam String month) {
        // 先计算月工资汇总，然后将所有日工资状态更新为SETTLED
        salaryService.monthlySummary(userId, month);
        // 更新日工资状态为SETTLED
        String[] parts = month.split("-");
        int year = Integer.parseInt(parts[0]);
        int m = Integer.parseInt(parts[1]);
        LocalDate monthStart = LocalDate.of(year, m, 1);
        LocalDate monthEnd = monthStart.plusMonths(1);

        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SalaryDaily> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(SalaryDaily::getUserId, userId);
        wrapper.ge(SalaryDaily::getWorkDate, monthStart);
        wrapper.lt(SalaryDaily::getWorkDate, monthEnd);
        wrapper.eq(SalaryDaily::getStatus, SalaryStatus.DRAFT.name());

        java.util.List<SalaryDaily> dailyList = salaryDailyMapper.selectList(wrapper);
        for (SalaryDaily daily : dailyList) {
            daily.setStatus(SalaryStatus.SETTLED.name());
            salaryDailyMapper.updateById(daily);
        }

        return R.ok("结算成功", null);
    }

    /**
     * 获取奖惩列表（路径别名，和 /adjusts 一样）
     */
    @GetMapping("/adjust")
    public R<PageResponse<SalaryAdjustResponse>> listAdjust(PageRequest request,
                                                              @RequestParam(required = false) Long userId,
                                                              @RequestParam(required = false) String adjustType) {
        return salaryService.listAdjusts(request, userId, adjustType);
    }

    /**
     * 更新奖惩
     */
    @PutMapping("/adjust/{id}")
    public R<Void> updateAdjust(@PathVariable Long id, @Valid @RequestBody SalaryAdjustRequest request) {
        SalaryAdjust salaryAdjust = salaryAdjustMapper.selectById(id);
        if (salaryAdjust == null) {
            return R.fail("奖惩记录不存在");
        }
        BeanUtils.copyProperties(request, salaryAdjust);
        salaryAdjust.setId(id);
        salaryAdjustMapper.updateById(salaryAdjust);
        return R.ok("更新成功", null);
    }

    /**
     * 删除奖惩
     */
    @DeleteMapping("/adjust/{id}")
    public R<Void> deleteAdjust(@PathVariable Long id) {
        salaryAdjustMapper.deleteById(id);
        return R.ok("删除成功", null);
    }
}
