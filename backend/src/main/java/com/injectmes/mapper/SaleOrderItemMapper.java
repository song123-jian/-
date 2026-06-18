package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.SaleOrderItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 销售订单明细Mapper
 */
@Mapper
public interface SaleOrderItemMapper extends BaseMapper<SaleOrderItem> {
}
