package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.ProdOrder;
import org.apache.ibatis.annotations.Mapper;

/**
 * 生产工单Mapper
 */
@Mapper
public interface ProdOrderMapper extends BaseMapper<ProdOrder> {
}
