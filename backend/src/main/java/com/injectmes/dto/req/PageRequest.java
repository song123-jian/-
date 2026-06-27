package com.injectmes.dto.req;

/**
 * 分页请求
 */
public class PageRequest {

    /** 页码 */
    private Integer page = 1;

    /** 每页大小 */
    private Integer size = 20;

    /** 每页大小别名，兼容前端 pageSize 参数 */
    private Integer pageSize;

    /** 关键词 */
    private String keyword;

    /** 状态 */
    private String status;

    /** 类型 */
    private String type;

    /** 工厂编码 */
    private String factoryCode;

    /** 车间 */
    private String workshop;

    /** 仓库 */
    private String warehouse;

    /** 产品 */
    private String product;

    /** 仓库ID */
    private Long warehouseId;

    /** 产品ID */
    private Long productId;

    /** 库位ID */
    private Long locationId;

    /** 开始日期 */
    private String startDate;

    /** 结束日期 */
    private String endDate;

    /** 排序（如：createdAt,desc） */
    private String sort = "createdAt,desc";

    public Integer getPage() {
        return page;
    }

    public void setPage(Integer page) {
        this.page = page;
    }

    public Integer getSize() {
        return pageSize != null ? pageSize : size;
    }

    public void setSize(Integer size) {
        this.size = size;
    }

    public Integer getPageSize() {
        return pageSize;
    }

    public void setPageSize(Integer pageSize) {
        this.pageSize = pageSize;
    }

    public String getKeyword() {
        return keyword;
    }

    public void setKeyword(String keyword) {
        this.keyword = keyword;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getFactoryCode() {
        return factoryCode;
    }

    public void setFactoryCode(String factoryCode) {
        this.factoryCode = factoryCode;
    }

    public String getWorkshop() {
        return workshop;
    }

    public void setWorkshop(String workshop) {
        this.workshop = workshop;
    }

    public String getSort() {
        return sort;
    }

    public void setSort(String sort) {
        this.sort = sort;
    }

    public String getWarehouse() {
        return warehouse;
    }

    public void setWarehouse(String warehouse) {
        this.warehouse = warehouse;
    }

    public String getProduct() {
        return product;
    }

    public void setProduct(String product) {
        this.product = product;
    }

    public Long getWarehouseId() {
        return warehouseId;
    }

    public void setWarehouseId(Long warehouseId) {
        this.warehouseId = warehouseId;
    }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public Long getLocationId() {
        return locationId;
    }

    public void setLocationId(Long locationId) {
        this.locationId = locationId;
    }

    public String getStartDate() {
        return startDate;
    }

    public void setStartDate(String startDate) {
        this.startDate = startDate;
    }

    public String getEndDate() {
        return endDate;
    }

    public void setEndDate(String endDate) {
        this.endDate = endDate;
    }
}
