package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.DeliveryOrderItem;
import org.apache.ibatis.annotations.Mapper;

/**
 * 发货单明细Mapper
 */
@Mapper
public interface DeliveryOrderItemMapper extends BaseMapper<DeliveryOrderItem> {
}
