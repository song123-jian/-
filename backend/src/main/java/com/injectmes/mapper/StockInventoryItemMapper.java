package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.StockInventoryItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 盘点明细Mapper
 */
@Mapper
public interface StockInventoryItemMapper extends BaseMapper<StockInventoryItem> {
}
