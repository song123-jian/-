package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.QcRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 质检记录Mapper
 */
@Mapper
public interface QcRecordMapper extends BaseMapper<QcRecord> {
}
