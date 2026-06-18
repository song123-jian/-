package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.DeliveryOrder;
import org.apache.ibatis.annotations.Mapper;

/**
 * 发货单Mapper
 */
@Mapper
public interface DeliveryOrderMapper extends BaseMapper<DeliveryOrder> {
}
