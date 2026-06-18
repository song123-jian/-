package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.StockInventory;
import org.apache.ibatis.annotations.Mapper;

/**
 * 盘点Mapper
 */
@Mapper
public interface StockInventoryMapper extends BaseMapper<StockInventory> {
}
