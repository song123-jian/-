package com.injectmes.service;

import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.write.metadata.WriteSheet;
import com.alibaba.excel.annotation.ExcelProperty;
import com.alibaba.excel.context.AnalysisContext;
import com.alibaba.excel.read.listener.ReadListener;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
import com.injectmes.entity.*;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.*;
import jakarta.servlet.http.HttpServletResponse;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 数据导入导出服务
 * 支持产品信息、客户信息、计件单价、期初库存的导入
 * 支持销售订单、生产工单、日工资、月工资、回款记录、库存报表、质检记录的导出
 */
@Slf4j
@Service
public class ImportExportService {

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private CustomerMapper customerMapper;

    @Autowired
    private MachineMapper machineMapper;

    @Autowired
    private MoldMapper moldMapper;

    @Autowired
    private PiecePriceMapper piecePriceMapper;

    @Autowired
    private StockMapper stockMapper;

    @Autowired
    private SaleOrderMapper saleOrderMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private SalaryDailyMapper salaryDailyMapper;

    @Autowired
    private SalaryAdjustMapper salaryAdjustMapper;

    @Autowired
    private PaymentRecordMapper paymentRecordMapper;

    @Autowired
    private QcRecordMapper qcRecordMapper;

    /** 批量插入的批次大小 */
    private static final int BATCH_SIZE = 500;

    /**
     * 数据导入
     * 根据type类型使用EasyExcel读取对应的数据
     *
     * @param type 导入类型（product/customer/piecePrice/stock）
     * @param file 上传的Excel文件
     * @return 操作结果
     */
    @Transactional
    public R<Void> importData(String type, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("导入文件不能为空");
        }

        try {
            switch (type) {
                case "product" -> importProduct(file);
                case "customer" -> importCustomer(file);
                case "machine" -> importMachine(file);
                case "mold" -> importMold(file);
                case "piecePrice" -> importPiecePrice(file);
                case "stock" -> importStock(file);
                default -> throw new BusinessException("不支持的导入类型: " + type);
            }
            return R.ok("导入成功", null);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("数据导入失败: type={}", type, e);
            throw new BusinessException("数据导入失败: " + e.getMessage());
        }
    }

    /**
     * 数据导出
     * 根据type类型使用EasyExcel写入对应的数据到Excel
     *
     * @param type     导出类型（saleOrder/prodOrder/salaryDaily/salaryMonthly/payment/stock/qcRecord）
     * @param response HTTP响应
     */
    public void exportData(String type, HttpServletResponse response) {
        try {
            // 设置响应头
            setExcelResponseHeaders(response, type);

            switch (type) {
                case "saleOrder" -> exportSaleOrder(response);
                case "prodOrder" -> exportProdOrder(response);
                case "salaryDaily" -> exportSalaryDaily(response);
                case "salaryMonthly" -> exportSalaryMonthly(response);
                case "payment" -> exportPayment(response);
                case "stock" -> exportStock(response);
                case "qcRecord" -> exportQcRecord(response);
                case "product" -> exportProduct(response);
                case "machine" -> exportMachine(response);
                case "mold" -> exportMold(response);
                default -> throw new BusinessException("不支持的导出类型: " + type);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("数据导出失败: type={}", type, e);
            throw new BusinessException("数据导出失败: " + e.getMessage());
        }
    }

    // ==================== 导入相关 ====================

    /**
     * 导入产品信息
     */
    private void importProduct(MultipartFile file) throws IOException {
        EasyExcel.read(file.getInputStream(), ProductImportDTO.class,
                new DataImportListener<>(productMapper, ProductImportDTO.class)).sheet().doRead();
    }

    /**
     * 导入客户信息
     */
    private void importCustomer(MultipartFile file) throws IOException {
        EasyExcel.read(file.getInputStream(), CustomerImportDTO.class,
                new DataImportListener<>(customerMapper, CustomerImportDTO.class)).sheet().doRead();
    }

    /**
     * 导入机台信息
     */
    private void importMachine(MultipartFile file) throws IOException {
        EasyExcel.read(file.getInputStream(), MachineImportDTO.class,
                new DataImportListener<>(machineMapper, MachineImportDTO.class)).sheet().doRead();
    }

    /**
     * 导入模具信息
     */
    private void importMold(MultipartFile file) throws IOException {
        EasyExcel.read(file.getInputStream(), MoldImportDTO.class,
                new DataImportListener<>(moldMapper, MoldImportDTO.class)).sheet().doRead();
    }

    /**
     * 导入计件单价
     */
    private void importPiecePrice(MultipartFile file) throws IOException {
        EasyExcel.read(file.getInputStream(), PiecePriceImportDTO.class,
                new DataImportListener<>(piecePriceMapper, PiecePriceImportDTO.class)).sheet().doRead();
    }

    /**
     * 导入期初库存
     */
    private void importStock(MultipartFile file) throws IOException {
        EasyExcel.read(file.getInputStream(), StockImportDTO.class,
                new DataImportListener<>(stockMapper, StockImportDTO.class)).sheet().doRead();
    }

    // ==================== 导出相关 ====================

    /**
     * 导出销售订单
     */
    private void exportSaleOrder(HttpServletResponse response) throws IOException {
        List<SaleOrder> dataList = saleOrderMapper.selectList(
                new LambdaQueryWrapper<SaleOrder>().orderByDesc(SaleOrder::getCreatedAt));

        List<SaleOrderExportDTO> exportList = new ArrayList<>();
        for (SaleOrder item : dataList) {
            SaleOrderExportDTO dto = new SaleOrderExportDTO();
            dto.setId(item.getId());
            dto.setOrderNo(item.getOrderNo());
            dto.setCustomerId(item.getCustomerId());
            dto.setOrderDate(item.getOrderDate() != null ? item.getOrderDate().toString() : "");
            dto.setDeliveryDate(item.getDeliveryDate() != null ? item.getDeliveryDate().toString() : "");
            dto.setTotalAmount(item.getTotalAmount());
            dto.setReceivedAmount(item.getReceivedAmount());
            dto.setStatus(item.getStatus());
            dto.setRemark(item.getRemark());
            exportList.add(dto);
        }

        writeExcel(response, exportList, SaleOrderExportDTO.class, "销售订单");
    }

    /**
     * 导出产品
     */
    private void exportProduct(HttpServletResponse response) throws IOException {
        List<Product> dataList = productMapper.selectList(new LambdaQueryWrapper<Product>().orderByDesc(Product::getCreatedAt));
        List<ProductExportDTO> exportList = new ArrayList<>();
        for (Product item : dataList) {
            ProductExportDTO dto = new ProductExportDTO();
            dto.setId(item.getId());
            dto.setCode(item.getCode());
            dto.setName(item.getName());
            dto.setSpec(item.getSpec());
            dto.setType(item.getType());
            dto.setUnit(item.getUnit());
            dto.setPiecePrice(item.getPiecePrice());
            dto.setCavityYield(item.getCavityYield());
            dto.setCycleTimeSec(item.getCycleTimeSec());
            dto.setSafeStock(item.getSafeStock());
            dto.setWeightG(item.getWeightG());
            dto.setRawMaterialUsage(item.getRawMaterialUsage());
            dto.setColor(item.getColor());
            dto.setStatus(item.getStatus() != null ? String.valueOf(item.getStatus()) : null);
            dto.setCreatedAt(item.getCreatedAt() != null ? item.getCreatedAt().toString() : "");
            exportList.add(dto);
        }
        writeExcel(response, exportList, ProductExportDTO.class, "产品");
    }

    /**
     * 导出机台
     */
    private void exportMachine(HttpServletResponse response) throws IOException {
        List<Machine> dataList = machineMapper.selectList(new LambdaQueryWrapper<Machine>().orderByDesc(Machine::getCreatedAt));
        List<MachineExportDTO> exportList = new ArrayList<>();
        for (Machine item : dataList) {
            MachineExportDTO dto = new MachineExportDTO();
            dto.setId(item.getId());
            dto.setCode(item.getCode());
            dto.setName(item.getName());
            dto.setModel(item.getModel());
            dto.setTonnage(item.getTonnage());
            dto.setStatus(item.getStatus());
            dto.setQrCode(item.getQrCode());
            dto.setLocation(item.getLocation());
            dto.setFactoryCode(item.getFactoryCode());
            dto.setWorkshop(item.getWorkshop());
            dto.setPurchaseDate(item.getPurchaseDate() != null ? item.getPurchaseDate().toString() : "");
            dto.setRemark(item.getRemark());
            dto.setCreatedAt(item.getCreatedAt() != null ? item.getCreatedAt().toString() : "");
            exportList.add(dto);
        }
        writeExcel(response, exportList, MachineExportDTO.class, "机台");
    }

    /**
     * 导出模具
     */
    private void exportMold(HttpServletResponse response) throws IOException {
        List<Mold> dataList = moldMapper.selectList(new LambdaQueryWrapper<Mold>().orderByDesc(Mold::getCreatedAt));
        List<MoldExportDTO> exportList = new ArrayList<>();
        for (Mold item : dataList) {
            MoldExportDTO dto = new MoldExportDTO();
            dto.setId(item.getId());
            dto.setCode(item.getCode());
            dto.setName(item.getName());
            dto.setProductId(item.getProductId());
            dto.setCavities(item.getCavities());
            dto.setLifetime(item.getLifetime());
            dto.setUsedShots(item.getUsedShots());
            dto.setShotsSinceMaintenance(item.getShotsSinceMaintenance());
            dto.setMaintenanceCycle(item.getMaintenanceCycle());
            dto.setMaintenanceCount(item.getMaintenanceCount());
            dto.setStatus(item.getStatus());
            dto.setRemark(item.getRemark());
            dto.setCreatedAt(item.getCreatedAt() != null ? item.getCreatedAt().toString() : "");
            exportList.add(dto);
        }
        writeExcel(response, exportList, MoldExportDTO.class, "模具");
    }

    /**
     * 导出生产工单
     */
    private void exportProdOrder(HttpServletResponse response) throws IOException {
        List<ProdOrder> dataList = prodOrderMapper.selectList(
                new LambdaQueryWrapper<ProdOrder>().orderByDesc(ProdOrder::getCreatedAt));

        List<ProdOrderExportDTO> exportList = new ArrayList<>();
        for (ProdOrder item : dataList) {
            ProdOrderExportDTO dto = new ProdOrderExportDTO();
            dto.setId(item.getId());
            dto.setOrderNo(item.getOrderNo());
            dto.setProductId(item.getProductId());
            dto.setMachineId(item.getMachineId());
            dto.setPlanQty(item.getPlanQty());
            dto.setCompletedQty(item.getCompletedQty());
            dto.setQualifiedQty(item.getQualifiedQty());
            dto.setBadQty(item.getBadQty());
            dto.setStatus(item.getStatus());
            dto.setRemark(item.getRemark());
            exportList.add(dto);
        }

        writeExcel(response, exportList, ProdOrderExportDTO.class, "生产工单");
    }

    /**
     * 导出日工资
     */
    private void exportSalaryDaily(HttpServletResponse response) throws IOException {
        List<SalaryDaily> dataList = salaryDailyMapper.selectList(
                new LambdaQueryWrapper<SalaryDaily>().orderByDesc(SalaryDaily::getCreatedAt));

        List<SalaryDailyExportDTO> exportList = new ArrayList<>();
        for (SalaryDaily item : dataList) {
            SalaryDailyExportDTO dto = new SalaryDailyExportDTO();
            dto.setId(item.getId());
            dto.setUserId(item.getUserId());
            dto.setWorkDate(item.getWorkDate() != null ? item.getWorkDate().toString() : "");
            dto.setTotalQualifiedQty(item.getTotalQualifiedQty());
            dto.setTotalPieceAmount(item.getTotalPieceAmount());
            dto.setSubsidy(item.getSubsidy());
            dto.setDeduction(item.getDeduction());
            dto.setTotalAmount(item.getTotalAmount());
            dto.setStatus(item.getStatus());
            exportList.add(dto);
        }

        writeExcel(response, exportList, SalaryDailyExportDTO.class, "日工资");
    }

    /**
     * 导出月工资（工资调整）
     */
    private void exportSalaryMonthly(HttpServletResponse response) throws IOException {
        List<SalaryAdjust> dataList = salaryAdjustMapper.selectList(
                new LambdaQueryWrapper<SalaryAdjust>().orderByDesc(SalaryAdjust::getCreatedAt));

        List<SalaryMonthlyExportDTO> exportList = new ArrayList<>();
        for (SalaryAdjust item : dataList) {
            SalaryMonthlyExportDTO dto = new SalaryMonthlyExportDTO();
            dto.setId(item.getId());
            dto.setUserId(item.getUserId());
            dto.setAdjustType(item.getAdjustType());
            dto.setAmount(item.getAmount());
            dto.setAdjustDate(item.getAdjustDate() != null ? item.getAdjustDate().toString() : "");
            dto.setReason(item.getReason());
            exportList.add(dto);
        }

        writeExcel(response, exportList, SalaryMonthlyExportDTO.class, "月工资调整");
    }

    /**
     * 导出回款记录
     */
    private void exportPayment(HttpServletResponse response) throws IOException {
        List<PaymentRecord> dataList = paymentRecordMapper.selectList(
                new LambdaQueryWrapper<PaymentRecord>().orderByDesc(PaymentRecord::getCreatedAt));

        List<PaymentExportDTO> exportList = new ArrayList<>();
        for (PaymentRecord item : dataList) {
            PaymentExportDTO dto = new PaymentExportDTO();
            dto.setId(item.getId());
            dto.setPaymentNo(item.getPaymentNo());
            dto.setCustomerId(item.getCustomerId());
            dto.setSaleOrderId(item.getSaleOrderId());
            dto.setPayAmount(item.getPayAmount());
            dto.setPayDate(item.getPayDate() != null ? item.getPayDate().toString() : "");
            dto.setPayMethod(item.getPayMethod());
            dto.setInvoiceNo(item.getInvoiceNo());
            dto.setRemark(item.getRemark());
            exportList.add(dto);
        }

        writeExcel(response, exportList, PaymentExportDTO.class, "回款记录");
    }

    /**
     * 导出库存报表
     */
    private void exportStock(HttpServletResponse response) throws IOException {
        List<Stock> dataList = stockMapper.selectList(null);

        List<StockExportDTO> exportList = new ArrayList<>();
        for (Stock item : dataList) {
            StockExportDTO dto = new StockExportDTO();
            dto.setId(item.getId());
            dto.setProductId(item.getProductId());
            dto.setWarehouseId(item.getWarehouseId());
            dto.setLocationId(item.getLocationId());
            dto.setBatchId(item.getBatchId());
            dto.setQty(item.getQty());
            dto.setLockedQty(item.getLockedQty());
            exportList.add(dto);
        }

        writeExcel(response, exportList, StockExportDTO.class, "库存报表");
    }

    /**
     * 导出质检记录
     */
    private void exportQcRecord(HttpServletResponse response) throws IOException {
        List<QcRecord> dataList = qcRecordMapper.selectList(
                new LambdaQueryWrapper<QcRecord>().orderByDesc(QcRecord::getCreatedAt));

        List<QcRecordExportDTO> exportList = new ArrayList<>();
        for (QcRecord item : dataList) {
            QcRecordExportDTO dto = new QcRecordExportDTO();
            dto.setId(item.getId());
            dto.setProdOrderId(item.getProdOrderId());
            dto.setProductId(item.getProductId());
            dto.setCheckType(item.getCheckType());
            dto.setCheckResult(item.getCheckResult());
            dto.setDefectType(item.getDefectType());
            dto.setDefectDesc(item.getDefectDesc());
            dto.setDefectQty(item.getDefectQty());
            dto.setSampleQty(item.getSampleQty());
            dto.setCheckerId(item.getCheckerId());
            dto.setCheckTime(item.getCheckTime() != null ? item.getCheckTime().format(
                    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")) : "");
            dto.setRemark(item.getRemark());
            exportList.add(dto);
        }

        writeExcel(response, exportList, QcRecordExportDTO.class, "质检记录");
    }

    // ==================== 通用方法 ====================

    /**
     * 设置Excel响应头
     */
    private void setExcelResponseHeaders(HttpServletResponse response, String type) {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setCharacterEncoding("utf-8");
        String fileName = URLEncoder.encode(type + "_" +
                LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")), StandardCharsets.UTF_8);
        response.setHeader("Content-Disposition", "attachment;filename=" + fileName + ".xlsx");
    }

    /**
     * 使用EasyExcel写入Excel文件
     */
    private <T> void writeExcel(HttpServletResponse response, List<T> data,
                                 Class<?> headClass, String sheetName) throws IOException {
        EasyExcel.write(response.getOutputStream(), headClass)
                .sheet(sheetName)
                .doWrite(data);
    }

    // ==================== 导入DTO（内部类） ====================

    /**
     * 产品信息导入DTO
     */
    @Data
    public static class ProductImportDTO {
        @ExcelProperty("产品编码")
        private String code;
        @ExcelProperty("产品名称")
        private String name;
        @ExcelProperty("规格")
        private String spec;
        @ExcelProperty("类型")
        private String type;
        @ExcelProperty("单位")
        private String unit;
        @ExcelProperty("计件单价")
        private BigDecimal piecePrice;
        @ExcelProperty("穴数")
        private Integer cavityYield;
        @ExcelProperty("周期(秒)")
        private Integer cycleTimeSec;
        @ExcelProperty("安全库存")
        private Integer safeStock;
        @ExcelProperty("重量(g)")
        private BigDecimal weightG;
        @ExcelProperty("颜色")
        private String color;
    }

    @Data
    public static class ProductExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("产品编码")
        private String code;
        @ExcelProperty("产品名称")
        private String name;
        @ExcelProperty("规格")
        private String spec;
        @ExcelProperty("类型")
        private String type;
        @ExcelProperty("单位")
        private String unit;
        @ExcelProperty("计件单价")
        private BigDecimal piecePrice;
        @ExcelProperty("穴数")
        private Integer cavityYield;
        @ExcelProperty("周期(秒)")
        private Integer cycleTimeSec;
        @ExcelProperty("安全库存")
        private Integer safeStock;
        @ExcelProperty("重量(g)")
        private BigDecimal weightG;
        @ExcelProperty("原料用量")
        private BigDecimal rawMaterialUsage;
        @ExcelProperty("颜色")
        private String color;
        @ExcelProperty("状态")
        private String status;
        @ExcelProperty("创建时间")
        private String createdAt;
    }

    /**
     * 客户信息导入DTO
     */
    @Data
    public static class CustomerImportDTO {
        @ExcelProperty("客户编码")
        private String code;
        @ExcelProperty("客户名称")
        private String name;
        @ExcelProperty("简称")
        private String shortName;
        @ExcelProperty("联系人")
        private String contact;
        @ExcelProperty("电话")
        private String phone;
        @ExcelProperty("地址")
        private String address;
        @ExcelProperty("税号")
        private String taxNo;
        @ExcelProperty("开票抬头")
        private String invoiceTitle;
        @ExcelProperty("信用等级")
        private String creditLevel;
        @ExcelProperty("账期(天)")
        private Integer paymentDays;
    }

    /**
     * 机台信息导入DTO
     */
    @Data
    public static class MachineImportDTO {
        @ExcelProperty("设备编码")
        private String code;
        @ExcelProperty("设备名称")
        private String name;
        @ExcelProperty("状态")
        private String status;
        @ExcelProperty("型号")
        private String model;
        @ExcelProperty("吨位")
        private Integer tonnage;
        @ExcelProperty("位置")
        private String location;
        @ExcelProperty("工厂编码")
        private String factoryCode;
        @ExcelProperty("车间")
        private String workshop;
        @ExcelProperty("购入日期")
        private LocalDate purchaseDate;
        @ExcelProperty("备注")
        private String remark;
        @ExcelProperty("二维码")
        private String qrCode;
    }

    @Data
    public static class MachineExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("设备编码")
        private String code;
        @ExcelProperty("设备名称")
        private String name;
        @ExcelProperty("型号")
        private String model;
        @ExcelProperty("吨位")
        private Integer tonnage;
        @ExcelProperty("状态")
        private String status;
        @ExcelProperty("二维码")
        private String qrCode;
        @ExcelProperty("位置")
        private String location;
        @ExcelProperty("工厂编码")
        private String factoryCode;
        @ExcelProperty("车间")
        private String workshop;
        @ExcelProperty("购入日期")
        private String purchaseDate;
        @ExcelProperty("备注")
        private String remark;
        @ExcelProperty("创建时间")
        private String createdAt;
    }

    /**
     * 模具信息导入DTO
     */
    @Data
    public static class MoldImportDTO {
        @ExcelProperty("模具编码")
        private String code;
        @ExcelProperty("模具名称")
        private String name;
        @ExcelProperty("产品ID")
        private Long productId;
        @ExcelProperty("穴数")
        private Integer cavities;
        @ExcelProperty("寿命")
        private Integer lifetime;
        @ExcelProperty("保养周期")
        private Integer maintenanceCycle;
        @ExcelProperty("状态")
        private String status;
        @ExcelProperty("备注")
        private String remark;
    }

    @Data
    public static class MoldExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("模具编码")
        private String code;
        @ExcelProperty("模具名称")
        private String name;
        @ExcelProperty("产品ID")
        private Long productId;
        @ExcelProperty("穴数")
        private Integer cavities;
        @ExcelProperty("寿命")
        private Integer lifetime;
        @ExcelProperty("已用模次")
        private Integer usedShots;
        @ExcelProperty("距维护")
        private Integer shotsSinceMaintenance;
        @ExcelProperty("保养周期")
        private Integer maintenanceCycle;
        @ExcelProperty("保养次数")
        private Integer maintenanceCount;
        @ExcelProperty("状态")
        private String status;
        @ExcelProperty("备注")
        private String remark;
        @ExcelProperty("创建时间")
        private String createdAt;
    }

    /**
     * 计件单价导入DTO
     */
    @Data
    public static class PiecePriceImportDTO {
        @ExcelProperty("产品ID")
        private Long productId;
        @ExcelProperty("工序名称")
        private String processName;
        @ExcelProperty("单价")
        private BigDecimal price;
        @ExcelProperty("生效日期")
        private String effectiveDate;
        @ExcelProperty("失效日期")
        private String expireDate;
    }

    /**
     * 期初库存导入DTO
     */
    @Data
    public static class StockImportDTO {
        @ExcelProperty("产品ID")
        private Long productId;
        @ExcelProperty("仓库ID")
        private Long warehouseId;
        @ExcelProperty("库位ID")
        private Long locationId;
        @ExcelProperty("批次ID")
        private Long batchId;
        @ExcelProperty("数量")
        private Integer qty;
    }

    // ==================== 导出DTO（内部类） ====================

    /**
     * 销售订单导出DTO
     */
    @Data
    public static class SaleOrderExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("订单编号")
        private String orderNo;
        @ExcelProperty("客户ID")
        private Long customerId;
        @ExcelProperty("订单日期")
        private String orderDate;
        @ExcelProperty("交货日期")
        private String deliveryDate;
        @ExcelProperty("总金额")
        private BigDecimal totalAmount;
        @ExcelProperty("已收金额")
        private BigDecimal receivedAmount;
        @ExcelProperty("状态")
        private String status;
        @ExcelProperty("备注")
        private String remark;
    }

    /**
     * 生产工单导出DTO
     */
    @Data
    public static class ProdOrderExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("工单编号")
        private String orderNo;
        @ExcelProperty("产品ID")
        private Long productId;
        @ExcelProperty("机台ID")
        private Long machineId;
        @ExcelProperty("计划数量")
        private Integer planQty;
        @ExcelProperty("完成数量")
        private Integer completedQty;
        @ExcelProperty("合格数量")
        private Integer qualifiedQty;
        @ExcelProperty("不良数量")
        private Integer badQty;
        @ExcelProperty("状态")
        private String status;
        @ExcelProperty("备注")
        private String remark;
    }

    /**
     * 日工资导出DTO
     */
    @Data
    public static class SalaryDailyExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("用户ID")
        private Long userId;
        @ExcelProperty("工作日期")
        private String workDate;
        @ExcelProperty("合格总数")
        private Integer totalQualifiedQty;
        @ExcelProperty("计件总额")
        private BigDecimal totalPieceAmount;
        @ExcelProperty("补贴")
        private BigDecimal subsidy;
        @ExcelProperty("扣款")
        private BigDecimal deduction;
        @ExcelProperty("总金额")
        private BigDecimal totalAmount;
        @ExcelProperty("状态")
        private String status;
    }

    /**
     * 月工资调整导出DTO
     */
    @Data
    public static class SalaryMonthlyExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("用户ID")
        private Long userId;
        @ExcelProperty("调整类型")
        private String adjustType;
        @ExcelProperty("金额")
        private BigDecimal amount;
        @ExcelProperty("调整日期")
        private String adjustDate;
        @ExcelProperty("原因")
        private String reason;
    }

    /**
     * 回款记录导出DTO
     */
    @Data
    public static class PaymentExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("回款编号")
        private String paymentNo;
        @ExcelProperty("客户ID")
        private Long customerId;
        @ExcelProperty("销售订单ID")
        private Long saleOrderId;
        @ExcelProperty("回款金额")
        private BigDecimal payAmount;
        @ExcelProperty("回款日期")
        private String payDate;
        @ExcelProperty("付款方式")
        private String payMethod;
        @ExcelProperty("发票号")
        private String invoiceNo;
        @ExcelProperty("备注")
        private String remark;
    }

    /**
     * 库存报表导出DTO
     */
    @Data
    public static class StockExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("产品ID")
        private Long productId;
        @ExcelProperty("仓库ID")
        private Long warehouseId;
        @ExcelProperty("库位ID")
        private Long locationId;
        @ExcelProperty("批次ID")
        private Long batchId;
        @ExcelProperty("数量")
        private Integer qty;
        @ExcelProperty("锁定数量")
        private Integer lockedQty;
    }

    /**
     * 质检记录导出DTO
     */
    @Data
    public static class QcRecordExportDTO {
        @ExcelProperty("ID")
        private Long id;
        @ExcelProperty("工单ID")
        private Long prodOrderId;
        @ExcelProperty("产品ID")
        private Long productId;
        @ExcelProperty("检验类型")
        private String checkType;
        @ExcelProperty("检验结果")
        private String checkResult;
        @ExcelProperty("缺陷类型")
        private String defectType;
        @ExcelProperty("缺陷描述")
        private String defectDesc;
        @ExcelProperty("缺陷数量")
        private Integer defectQty;
        @ExcelProperty("抽样数量")
        private Integer sampleQty;
        @ExcelProperty("检验员ID")
        private Long checkerId;
        @ExcelProperty("检验时间")
        private String checkTime;
        @ExcelProperty("备注")
        private String remark;
    }

    // ==================== EasyExcel ReadListener ====================

    /**
     * 通用数据导入监听器
     * 读取Excel行数据并批量插入数据库
     *
     * @param <T> 数据类型
     */
    private class DataImportListener<T> implements ReadListener<T> {

        /** 缓存的数据列表 */
        private final List<T> cachedDataList = new ArrayList<>();

        /** 对应的Mapper */
        private final Object mapper;

        /** 数据类型Class */
        private final Class<T> dataClass;

        /** 导入成功数量 */
        private int successCount = 0;

        /** 导入失败数量 */
        private int failCount = 0;

        public DataImportListener(Object mapper, Class<T> dataClass) {
            this.mapper = mapper;
            this.dataClass = dataClass;
        }

        @Override
        public void invoke(T data, AnalysisContext context) {
            cachedDataList.add(data);
            // 达到批次大小则执行批量插入
            if (cachedDataList.size() >= BATCH_SIZE) {
                saveData();
            }
        }

        @Override
        public void doAfterAllAnalysed(AnalysisContext context) {
            // 处理剩余数据
            saveData();
            log.info("数据导入完成: 类型={}, 成功={}, 失败={}", dataClass.getSimpleName(), successCount, failCount);
        }

        /**
         * 批量保存数据
         * 根据数据类型调用对应的Mapper进行插入
         */
        @SuppressWarnings("unchecked")
        private void saveData() {
            if (cachedDataList.isEmpty()) {
                return;
            }

            try {
                for (T item : cachedDataList) {
                    try {
                        // 将导入DTO转换为实体并插入
                        Object entity = convertToEntity(item);
                        if (entity instanceof Product product) {
                            productMapper.insert(product);
                        } else if (entity instanceof Customer customer) {
                            customerMapper.insert(customer);
                        } else if (entity instanceof Machine machine) {
                            machineMapper.insert(machine);
                        } else if (entity instanceof Mold mold) {
                            moldMapper.insert(mold);
                        } else if (entity instanceof PiecePrice piecePrice) {
                            piecePriceMapper.insert(piecePrice);
                        } else if (entity instanceof Stock stock) {
                            stockMapper.insert(stock);
                        }
                        successCount++;
                    } catch (Exception e) {
                        failCount++;
                        log.warn("导入单条数据失败: {}", e.getMessage());
                    }
                }
            } catch (Exception e) {
                log.error("批量导入数据异常", e);
                failCount += cachedDataList.size();
            }

            cachedDataList.clear();
        }

        /**
         * 将导入DTO转换为对应的实体对象
         */
        private Object convertToEntity(T item) {
            if (item instanceof ProductImportDTO dto) {
                Product entity = new Product();
                entity.setCode(dto.getCode());
                entity.setName(dto.getName());
                entity.setSpec(dto.getSpec());
                entity.setType(dto.getType());
                entity.setUnit(dto.getUnit());
                entity.setPiecePrice(dto.getPiecePrice());
                entity.setCavityYield(dto.getCavityYield());
                entity.setCycleTimeSec(dto.getCycleTimeSec());
                entity.setSafeStock(dto.getSafeStock());
                entity.setWeightG(dto.getWeightG());
                entity.setColor(dto.getColor());
                entity.setStatus(1);
                entity.setCreatedAt(LocalDateTime.now());
                return entity;
            } else if (item instanceof CustomerImportDTO dto) {
                Customer entity = new Customer();
                entity.setCode(dto.getCode());
                entity.setName(dto.getName());
                entity.setShortName(dto.getShortName());
                entity.setContact(dto.getContact());
                entity.setPhone(dto.getPhone());
                entity.setAddress(dto.getAddress());
                entity.setTaxNo(dto.getTaxNo());
                entity.setInvoiceTitle(dto.getInvoiceTitle());
                entity.setCreditLevel(dto.getCreditLevel());
                entity.setPaymentDays(dto.getPaymentDays());
                entity.setStatus(1);
                entity.setCreatedAt(LocalDateTime.now());
                return entity;
            } else if (item instanceof MachineImportDTO dto) {
                Machine entity = new Machine();
                entity.setCode(dto.getCode());
                entity.setName(dto.getName());
                entity.setStatus(dto.getStatus() != null && !dto.getStatus().trim().isEmpty() ? dto.getStatus().trim() : "IDLE");
                entity.setModel(dto.getModel());
                entity.setTonnage(dto.getTonnage());
                entity.setLocation(dto.getLocation());
                entity.setFactoryCode(dto.getFactoryCode());
                entity.setWorkshop(dto.getWorkshop());
                entity.setPurchaseDate(dto.getPurchaseDate());
                entity.setRemark(dto.getRemark());
                entity.setQrCode(dto.getQrCode());
                entity.setCreatedAt(LocalDateTime.now());
                return entity;
            } else if (item instanceof MoldImportDTO dto) {
                Mold entity = new Mold();
                entity.setCode(dto.getCode());
                entity.setName(dto.getName());
                entity.setProductId(dto.getProductId());
                entity.setCavities(dto.getCavities());
                entity.setLifetime(dto.getLifetime());
                entity.setMaintenanceCycle(dto.getMaintenanceCycle());
                entity.setStatus(dto.getStatus() != null && !dto.getStatus().trim().isEmpty() ? dto.getStatus().trim() : "NORMAL");
                entity.setRemark(dto.getRemark());
                entity.setUsedShots(0);
                entity.setShotsSinceMaintenance(0);
                entity.setMaintenanceCount(0);
                entity.setCreatedAt(LocalDateTime.now());
                return entity;
            } else if (item instanceof PiecePriceImportDTO dto) {
                PiecePrice entity = new PiecePrice();
                entity.setProductId(dto.getProductId());
                entity.setProcessName(dto.getProcessName());
                entity.setPrice(dto.getPrice());
                if (dto.getEffectiveDate() != null && !dto.getEffectiveDate().isEmpty()) {
                    entity.setEffectiveDate(LocalDate.parse(dto.getEffectiveDate()));
                }
                if (dto.getExpireDate() != null && !dto.getExpireDate().isEmpty()) {
                    entity.setExpireDate(LocalDate.parse(dto.getExpireDate()));
                }
                entity.setCreatedAt(LocalDateTime.now());
                return entity;
            } else if (item instanceof StockImportDTO dto) {
                Stock entity = new Stock();
                entity.setProductId(dto.getProductId());
                entity.setWarehouseId(dto.getWarehouseId());
                entity.setLocationId(dto.getLocationId());
                entity.setBatchId(dto.getBatchId());
                entity.setQty(dto.getQty());
                entity.setLockedQty(0);
                entity.setUpdatedAt(LocalDateTime.now());
                return entity;
            }
            throw new BusinessException("不支持的导入数据类型: " + item.getClass().getSimpleName());
        }
    }
}
