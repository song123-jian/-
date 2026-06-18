package com.injectmes.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;

/**
 * 单据序号表 —— 用于并发安全的单据号分配
 */
@Data
@TableName("seq_number")
public class SeqNumber {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 序号类型编码，如 SO/PO/DO/PAY/EXP/TR/IV/SM/BATCH */
    private String seqType;

    /** 当前日期 */
    private LocalDate seqDate;

    /** 当前序号值 */
    private Integer currentSeq;
}
