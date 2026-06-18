package com.injectmes.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.injectmes.entity.Customer;
import org.apache.ibatis.annotations.Mapper;

/**
 * 客户Mapper
 */
@Mapper
public interface CustomerMapper extends BaseMapper<Customer> {
}
