package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.MachineInspectionRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 设备点检记录Mapper
 */
@Mapper
public interface MachineInspectionRecordMapper extends BaseMapper<MachineInspectionRecord> {
}
