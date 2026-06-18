package com.injectmes.controller;

import com.injectmes.common.R;
import com.injectmes.service.ImportExportService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * 数据导入导出控制器
 * 提供产品信息、客户信息、计件单价、期初库存的导入接口
 * 提供销售订单、生产工单、日/月工资、回款记录、库存报表、质检记录的导出接口
 */
@RestController
@RequestMapping("/api")
@Validated
public class ImportExportController {

    @Autowired
    private ImportExportService importExportService;

    /**
     * 数据导入
     * 支持类型: product(产品信息)、customer(客户信息)、piecePrice(计件单价)、stock(期初库存)
     *
     * @param type 导入类型
     * @param file Excel文件
     * @return 操作结果
     */
    @PostMapping("/import/{type}")
    public R<Void> importData(@PathVariable String type, @RequestParam("file") MultipartFile file) {
        return importExportService.importData(type, file);
    }

    /**
     * 数据导出
     * 支持类型: saleOrder(销售订单)、prodOrder(生产工单)、salaryDaily(日工资)、
     *          salaryMonthly(月工资)、payment(回款记录)、stock(库存报表)、qcRecord(质检记录)
     *
     * @param type     导出类型
     * @param response HTTP响应
     */
    @GetMapping("/export/{type}")
    public void exportData(@PathVariable String type, HttpServletResponse response) {
        importExportService.exportData(type, response);
    }
}
