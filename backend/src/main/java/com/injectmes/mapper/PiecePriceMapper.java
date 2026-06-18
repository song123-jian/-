package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.PiecePrice;
import org.apache.ibatis.annotations.Mapper;

/**
 * 计件单价Mapper
 */
@Mapper
public interface PiecePriceMapper extends BaseMapper<PiecePrice> {
}
