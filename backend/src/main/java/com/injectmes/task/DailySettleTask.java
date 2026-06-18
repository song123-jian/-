package com.injectmes.task;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.entity.ProdReport;
import com.injectmes.entity.SysUser;
import com.injectmes.mapper.ProdReportMapper;
import com.injectmes.mapper.SysUserMapper;
import com.injectmes.service.SalaryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 日结定时任务
 * 每日23:30执行日结，计算所有当日有报工的员工的日工资
 */
@Component
public class DailySettleTask {

    private static final Logger log = LoggerFactory.getLogger(DailySettleTask.class);

    @Autowired
    private ProdReportMapper prodReportMapper;
    @Autowired
    private SysUserMapper sysUserMapper;
    @Autowired
    private SalaryService salaryService;

    /**
     * 每日23:30执行日结
     * - 计算所有当日有报工的员工的日工资
     */
    @Scheduled(cron = "0 30 23 * * ?")
    public void dailySettle() {
        log.info("========== 开始执行日结任务 ==========");
        LocalDate today = LocalDate.now();
        LocalDateTime dayStart = today.atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);

        // 查询当日有报工的所有员工ID
        LambdaQueryWrapper<ProdReport> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(ProdReport::getCreatedAt, dayStart);
        wrapper.lt(ProdReport::getCreatedAt, dayEnd);
        List<ProdReport> todayReports = prodReportMapper.selectList(wrapper);

        // 按员工ID去重
        List<Long> userIds = todayReports.stream()
                .map(ProdReport::getUserId)
                .filter(userId -> userId != null)
                .distinct()
                .collect(Collectors.toList());

        log.info("当日有报工的员工数：{}", userIds.size());

        int successCount = 0;
        int failCount = 0;

        for (Long userId : userIds) {
            try {
                salaryService.calculateDaily(userId, today);
                successCount++;
                log.info("员工ID={} 日工资计算成功", userId);
            } catch (Exception e) {
                failCount++;
                log.error("员工ID={} 日工资计算失败：{}", userId, e.getMessage());
            }
        }

        log.info("========== 日结任务完成，成功：{}，失败：{} ==========", successCount, failCount);
    }
}
