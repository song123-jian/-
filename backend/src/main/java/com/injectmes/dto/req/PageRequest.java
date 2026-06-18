package com.injectmes.dto.req;

/**
 * 分页请求
 */
public class PageRequest {

    /** 页码 */
    private Integer page = 1;

    /** 每页大小 */
    private Integer size = 20;

    /** 关键词 */
    private String keyword;

    /** 排序（如：createdAt,desc） */
    private String sort = "createdAt,desc";

    public Integer getPage() {
        return page;
    }

    public void setPage(Integer page) {
        this.page = page;
    }

    public Integer getSize() {
        return size;
    }

    public void setSize(Integer size) {
        this.size = size;
    }

    public String getKeyword() {
        return keyword;
    }

    public void setKeyword(String keyword) {
        this.keyword = keyword;
    }

    public String getSort() {
        return sort;
    }

    public void setSort(String sort) {
        this.sort = sort;
    }
}
