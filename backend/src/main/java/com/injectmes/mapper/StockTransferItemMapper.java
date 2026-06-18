package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.StockTransferItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 调拨明细Mapper
 */
@Mapper
public interface StockTransferItemMapper extends BaseMapper<StockTransferItem> {
}
