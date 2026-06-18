package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.ProdReport;
import org.apache.ibatis.annotations.Mapper;

/**
 * 生产报工Mapper
 */
@Mapper
public interface ProdReportMapper extends BaseMapper<ProdReport> {
}
