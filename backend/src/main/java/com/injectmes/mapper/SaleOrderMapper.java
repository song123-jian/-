package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.SaleOrder;
import org.apache.ibatis.annotations.Mapper;

/**
 * 销售订单Mapper
 */
@Mapper
public interface SaleOrderMapper extends BaseMapper<SaleOrder> {
}
