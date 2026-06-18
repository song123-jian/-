package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.DowntimeRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 停机记录Mapper
 */
@Mapper
public interface DowntimeRecordMapper extends BaseMapper<DowntimeRecord> {
}
