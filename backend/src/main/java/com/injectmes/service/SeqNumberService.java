package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.entity.SeqNumber;
import com.injectmes.mapper.SeqNumberMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 单据号序号服务 —— 基于数据库行锁实现并发安全的序号分配
 * <p>
 * 核心思路：利用 UPDATE 语句的行级锁保证同一类型+日期的序号递增是原子的。
 * 若 UPDATE 受影响行数为0，说明该类型+日期的记录不存在，先 INSERT 再 UPDATE。
 * </p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SeqNumberService {

    private final SeqNumberMapper seqNumberMapper;

    /**
     * 获取下一个序号（并发安全）
     *
     * @param seqType 序号类型编码，如 SO/PO/DO/PAY/EXP/TR/IV/SM/BATCH
     * @param seqLen  序号位数（3位或4位）
     * @return 格式化的序号字符串，如 "001"、"0001"
     */
    @Transactional
    public String nextSeq(String seqType, int seqLen) {
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));

        // 尝试原子递增
        int affected = seqNumberMapper.incrementSeq(seqType, dateStr);
        int seq;

        if (affected > 0) {
            // 递增成功，查询当前值
            SeqNumber record = seqNumberMapper.selectOne(
                    new LambdaQueryWrapper<SeqNumber>()
                            .eq(SeqNumber::getSeqType, seqType)
                            .eq(SeqNumber::getSeqDate, LocalDate.now())
            );
            seq = record.getCurrentSeq();
        } else {
            // 记录不存在，先插入初始行
            SeqNumber newRecord = new SeqNumber();
            newRecord.setSeqType(seqType);
            newRecord.setSeqDate(LocalDate.now());
            newRecord.setCurrentSeq(0);
            seqNumberMapper.insert(newRecord);

            // 再原子递增到1
            seqNumberMapper.incrementSeq(seqType, dateStr);
            seq = 1;
        }

        return String.format("%0" + seqLen + "d", seq);
    }

    /**
     * 生成完整单据号
     *
     * @param prefix 前缀，如 "SO"、"PO"、"SM"
     * @param seqLen 序号位数
     * @return 完整单据号，如 "SO20260617001"
     */
    public String generateNo(String prefix, int seqLen) {
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String seq = nextSeq(prefix, seqLen);
        return prefix + dateStr + seq;
    }

    /**
     * 生成批次号（特殊格式 R-YYYYMMDD-序号）
     */
    public String generateBatchNo() {
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String seq = nextSeq("BATCH", 3);
        return "R-" + dateStr + "-" + seq;
    }
}
