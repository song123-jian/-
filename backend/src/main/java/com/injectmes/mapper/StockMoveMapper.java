package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.StockMove;
import org.apache.ibatis.annotations.Mapper;

/**
 * 库存流水Mapper
 */
@Mapper
public interface StockMoveMapper extends BaseMapper<StockMove> {
}
