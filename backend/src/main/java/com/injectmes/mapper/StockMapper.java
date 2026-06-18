package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.Stock;
import org.apache.ibatis.annotations.Mapper;

/**
 * 库存Mapper
 */
@Mapper
public interface StockMapper extends BaseMapper<Stock> {
}
