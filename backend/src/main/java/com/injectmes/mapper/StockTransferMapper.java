package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.StockTransfer;
import org.apache.ibatis.annotations.Mapper;

/**
 * 调拨Mapper
 */
@Mapper
public interface StockTransferMapper extends BaseMapper<StockTransfer> {
}
