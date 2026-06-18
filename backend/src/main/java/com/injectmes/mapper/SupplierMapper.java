package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.Supplier;
import org.apache.ibatis.annotations.Mapper;

/**
 * 供应商Mapper
 */
@Mapper
public interface SupplierMapper extends BaseMapper<Supplier> {
}
