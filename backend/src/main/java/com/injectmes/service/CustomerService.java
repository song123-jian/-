package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.injectmes.common.R;
import com.injectmes.dto.req.CustomerCreateRequest;
import com.injectmes.dto.req.CustomerUpdateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.CustomerResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.Customer;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.CustomerMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 客户服务
 */
@Service
public class CustomerService {

    @Autowired
    private CustomerMapper customerMapper;

    /**
     * 分页查询客户列表
     * 支持keyword模糊搜索code/name/shortName
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<CustomerResponse>> list(PageRequest request) {
        Page<Customer> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Customer> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(Customer::getCode, keyword)
                    .or().like(Customer::getName, keyword)
                    .or().like(Customer::getShortName, keyword)
            );
        }
        if (request.getStatus() != null && !request.getStatus().trim().isEmpty()) {
            wrapper.eq(Customer::getStatus, Integer.valueOf(request.getStatus().trim()));
        }

        // 按创建时间降序
        wrapper.orderByDesc(Customer::getCreatedAt);

        Page<Customer> result = customerMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<CustomerResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<CustomerResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询客户
     *
     * @param id 客户ID
     * @return 客户响应
     */
    public R<CustomerResponse> getById(Long id) {
        Customer customer = customerMapper.selectById(id);
        if (customer == null) {
            throw new BusinessException("客户不存在");
        }
        return R.ok(convertToResponse(customer));
    }

    /**
     * 创建客户
     *
     * @param request 创建客户请求
     * @return 客户响应
     */
    @Transactional
    public R<CustomerResponse> create(CustomerCreateRequest request) {
        // 检查编码是否已存在
        Long count = customerMapper.selectCount(
                new LambdaQueryWrapper<Customer>().eq(Customer::getCode, request.getCode())
        );
        if (count > 0) {
            throw new BusinessException("客户编码已存在");
        }

        Customer customer = new Customer();
        BeanUtils.copyProperties(request, customer);
        if (customer.getStatus() == null) {
            customer.setStatus(1);
        } else {
            customer.setStatus(Integer.valueOf(request.getStatus()));
        }
        customer.setCreatedAt(LocalDateTime.now());

        customerMapper.insert(customer);

        return R.ok("创建成功", convertToResponse(customer));
    }

    /**
     * 更新客户
     *
     * @param id      客户ID
     * @param request 更新客户请求
     * @return 客户响应
     */
    @Transactional
    public R<CustomerResponse> update(Long id, CustomerUpdateRequest request) {
        Customer customer = customerMapper.selectById(id);
        if (customer == null) {
            throw new BusinessException("客户不存在");
        }

        // 更新非空字段
        if (request.getName() != null) {
            customer.setName(request.getName());
        }
        if (request.getShortName() != null) {
            customer.setShortName(request.getShortName());
        }
        if (request.getContact() != null) {
            customer.setContact(request.getContact());
        }
        if (request.getPhone() != null) {
            customer.setPhone(request.getPhone());
        }
        if (request.getAddress() != null) {
            customer.setAddress(request.getAddress());
        }
        if (request.getTaxNo() != null) {
            customer.setTaxNo(request.getTaxNo());
        }
        if (request.getInvoiceTitle() != null) {
            customer.setInvoiceTitle(request.getInvoiceTitle());
        }
        if (request.getCreditLevel() != null) {
            customer.setCreditLevel(request.getCreditLevel());
        }
        if (request.getPaymentDays() != null) {
            customer.setPaymentDays(request.getPaymentDays());
        }
        if (request.getSalesUserId() != null) {
            customer.setSalesUserId(request.getSalesUserId());
        }
        if (request.getStatus() != null) {
            customer.setStatus(Integer.valueOf(request.getStatus()));
        }

        customerMapper.updateById(customer);

        return R.ok("更新成功", convertToResponse(customer));
    }

    /**
     * 删除客户
     *
     * @param id 客户ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> delete(Long id) {
        Customer customer = customerMapper.selectById(id);
        if (customer == null) {
            throw new BusinessException("客户不存在");
        }

        customerMapper.deleteById(id);

        return R.ok("删除成功", null);
    }

    /**
     * 实体转响应DTO
     */
    private CustomerResponse convertToResponse(Customer customer) {
        CustomerResponse response = new CustomerResponse();
        BeanUtils.copyProperties(customer, response);
        // status类型转换：Integer -> String
        if (customer.getStatus() != null) {
            response.setStatus(String.valueOf(customer.getStatus()));
        }
        return response;
    }
}
