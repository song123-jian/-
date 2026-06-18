package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.ExpenseRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 费用记录Mapper
 */
@Mapper
public interface ExpenseRecordMapper extends BaseMapper<ExpenseRecord> {
}
