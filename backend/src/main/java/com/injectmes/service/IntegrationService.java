package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.injectmes.common.R;
import com.injectmes.dto.req.DeviceLabelRequest;
import com.injectmes.dto.req.DeviceScanRequest;
import com.injectmes.dto.req.DeviceScaleRequest;
import com.injectmes.dto.req.DeviceTelemetryRequest;
import com.injectmes.dto.req.ProdReportRequest;
import com.injectmes.dto.req.PushTestRequest;
import com.injectmes.entity.*;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 设备与消息集成服务
 */
@Service
public class IntegrationService {

    @Autowired
    private MachineMapper machineMapper;

    @Autowired
    private MoldMapper moldMapper;

    @Autowired
    private ProductMapper productMapper;

    @Autowired
    private MaterialBatchMapper materialBatchMapper;

    @Autowired
    private ProdOrderMapper prodOrderMapper;

    @Autowired
    private ProdReportService prodReportService;

    @Autowired
    private MachineService machineService;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private ExternalMessagePushService externalMessagePushService;

    @Transactional
    public R<Map<String, Object>> processPlcTelemetry(DeviceTelemetryRequest request) {
        Machine machine = resolveMachine(request.getMachineId(), request.getMachineCode());
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }

        String beforeStatus = machine.getStatus();
        String nextStatus = normalizeStatus(request.getStatus());
        if (nextStatus != null) {
            machine.setStatus(nextStatus);
            machineMapper.updateById(machine);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("machineId", machine.getId());
        result.put("machineCode", machine.getCode());
        result.put("machineName", machine.getName());
        result.put("beforeStatus", beforeStatus);
        result.put("afterStatus", machine.getStatus());

        boolean hasReportData = request.getProdOrderId() != null
                || StringUtils.hasText(request.getOrderNo())
                || request.getQty() != null
                || request.getBadQty() != null
                || request.getShots() != null
                || StringUtils.hasText(request.getReportType());
        if (hasReportData) {
            Long prodOrderId = resolveProdOrderId(request, machine.getId());
            if (prodOrderId == null) {
                throw new BusinessException("未找到可关联的工单");
            }

            ProdOrder order = prodOrderMapper.selectById(prodOrderId);
            if (order == null) {
                throw new BusinessException("生产工单不存在");
            }

            ProdReportRequest reportRequest = new ProdReportRequest();
            reportRequest.setProdOrderId(prodOrderId);
            reportRequest.setMachineId(machine.getId());
            reportRequest.setMoldId(resolveMoldId(request, order));
            reportRequest.setReportType(StringUtils.hasText(request.getReportType()) ? request.getReportType() : "OUTPUT");
            reportRequest.setShift(StringUtils.hasText(request.getShift()) ? request.getShift() : "DAY");
            reportRequest.setQty(request.getQty() != null ? request.getQty() : 0);
            reportRequest.setBadQty(request.getBadQty() != null ? request.getBadQty() : 0);
            reportRequest.setShots(request.getShots());
            reportRequest.setStartTime(request.getStartTime());
            reportRequest.setEndTime(request.getEndTime());

            result.put("report", prodReportService.report(reportRequest).getData());
        }

        if (StringUtils.hasText(request.getStatus()) && !equalsIgnoreCase(beforeStatus, machine.getStatus())) {
            String content = String.format("机台 %s 状态变更为 %s，来源：%s",
                    machine.getName(),
                    machine.getStatus(),
                    StringUtils.hasText(request.getSource()) ? request.getSource() : "PLC/IO");
            notificationService.broadcastNotification("机台状态更新", content, "INFO");
            result.put("notification", content);
        }

        return R.ok("采集成功", result);
    }

    public R<Map<String, Object>> scan(DeviceScanRequest request) {
        String code = request.getCode().trim();
        String codeType = normalizeType(request.getCodeType());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("code", code);
        result.put("codeType", codeType);

        Object match = null;
        String targetType = null;

        if ("MACHINE".equals(codeType) || code.startsWith("MACHINE:")) {
            Machine machine = findMachineByCode(code);
            if (machine != null) {
                match = machine;
                targetType = "MACHINE";
            }
        } else if ("MOLD".equals(codeType) || code.startsWith("MOLD:")) {
            Mold mold = findMoldByCode(code);
            if (mold != null) {
                match = mold;
                targetType = "MOLD";
            }
        } else if ("PRODUCT".equals(codeType) || code.startsWith("PRODUCT:")) {
            Product product = findProductByCode(code);
            if (product != null) {
                match = product;
                targetType = "PRODUCT";
            }
        } else if ("BATCH".equals(codeType) || code.startsWith("BATCH:")) {
            MaterialBatch batch = findBatchByCode(code);
            if (batch != null) {
                match = batch;
                targetType = "BATCH";
            }
        } else {
            Machine machine = findMachineByCode(code);
            if (machine != null) {
                match = machine;
                targetType = "MACHINE";
            } else {
                Mold mold = findMoldByCode(code);
                if (mold != null) {
                    match = mold;
                    targetType = "MOLD";
                } else {
                    Product product = findProductByCode(code);
                    if (product != null) {
                        match = product;
                        targetType = "PRODUCT";
                    } else {
                        MaterialBatch batch = findBatchByCode(code);
                        if (batch != null) {
                            match = batch;
                            targetType = "BATCH";
                        }
                    }
                }
            }
        }

        if (match == null) {
            result.put("matched", false);
            result.put("message", "未识别到匹配对象");
            return R.ok("未识别到匹配对象", result);
        }

        result.put("matched", true);
        result.put("targetType", targetType);
        result.put("target", convertScanTarget(targetType, match));
        return R.ok(result);
    }

    public R<Map<String, Object>> previewLabel(DeviceLabelRequest request) {
        String targetType = normalizeType(request.getTargetType());
        Object target;
        if ("MACHINE".equals(targetType)) {
            target = machineMapper.selectById(request.getTargetId());
        } else if ("MOLD".equals(targetType)) {
            target = moldMapper.selectById(request.getTargetId());
        } else if ("PRODUCT".equals(targetType)) {
            target = productMapper.selectById(request.getTargetId());
        } else if ("BATCH".equals(targetType)) {
            target = materialBatchMapper.selectById(request.getTargetId());
        } else {
            throw new BusinessException("不支持的标签类型");
        }

        if (target == null) {
            throw new BusinessException("目标不存在");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("targetType", targetType);
        result.put("targetId", request.getTargetId());
        result.put("label", buildLabel(targetType, target));
        return R.ok(result);
    }

    public R<Map<String, Object>> convertScale(DeviceScaleRequest request) {
        BigDecimal gross = request.getGrossWeight() != null ? request.getGrossWeight() : BigDecimal.ZERO;
        BigDecimal tare = request.getTareWeight() != null ? request.getTareWeight() : BigDecimal.ZERO;
        BigDecimal unitWeight = request.getUnitWeight();
        if (unitWeight == null && request.getProductId() != null) {
            Product product = productMapper.selectById(request.getProductId());
            if (product != null) {
                unitWeight = product.getWeightG() != null ? product.getWeightG() : product.getRawMaterialUsage();
            }
        }

        BigDecimal net = gross.subtract(tare);
        if (net.compareTo(BigDecimal.ZERO) < 0) {
            net = BigDecimal.ZERO;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("productId", request.getProductId());
        result.put("grossWeight", gross);
        result.put("tareWeight", tare);
        result.put("netWeight", net);
        result.put("unitWeight", unitWeight);
        if (unitWeight != null && unitWeight.compareTo(BigDecimal.ZERO) > 0) {
            result.put("estimatedQty", net.divide(unitWeight, 0, RoundingMode.DOWN));
        } else {
            result.put("estimatedQty", null);
        }
        return R.ok(result);
    }

    public R<Map<String, Object>> pushTest(PushTestRequest request) {
        Map<String, Object> result = externalMessagePushService.push(
                request.getTitle(),
                request.getContent(),
                StringUtils.hasText(request.getType()) ? request.getType() : "INFO"
        );
        return R.ok("推送完成", result);
    }

    private Machine resolveMachine(Long machineId, String machineCode) {
        if (machineId != null) {
            return machineMapper.selectById(machineId);
        }
        if (StringUtils.hasText(machineCode)) {
            return machineMapper.selectOne(new LambdaQueryWrapper<Machine>()
                    .eq(Machine::getCode, machineCode.trim()));
        }
        return null;
    }

    private Long resolveProdOrderId(DeviceTelemetryRequest request, Long machineId) {
        if (request.getProdOrderId() != null) {
            return request.getProdOrderId();
        }
        if (StringUtils.hasText(request.getOrderNo())) {
            ProdOrder order = prodOrderMapper.selectOne(new LambdaQueryWrapper<ProdOrder>()
                    .eq(ProdOrder::getOrderNo, request.getOrderNo().trim()));
            if (order != null) {
                return order.getId();
            }
        }
        ProdOrder currentOrder = prodOrderMapper.selectOne(new LambdaQueryWrapper<ProdOrder>()
                .eq(ProdOrder::getMachineId, machineId)
                .eq(ProdOrder::getStatus, "RUNNING")
                .orderByDesc(ProdOrder::getUpdatedAt)
                .last("LIMIT 1"));
        return currentOrder != null ? currentOrder.getId() : null;
    }

    private Long resolveMoldId(DeviceTelemetryRequest request, ProdOrder order) {
        if (request.getMoldId() != null) {
            return request.getMoldId();
        }
        return order.getMoldId();
    }

    private String normalizeStatus(String status) {
        if (!StringUtils.hasText(status)) {
            return null;
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "RUNNING", "IDLE", "MAINTENANCE", "STOPPED" -> normalized;
            default -> throw new BusinessException("不支持的机台状态");
        };
    }

    private String normalizeType(String type) {
        return StringUtils.hasText(type) ? type.trim().toUpperCase(Locale.ROOT) : null;
    }

    private boolean equalsIgnoreCase(String left, String right) {
        if (left == null && right == null) {
            return true;
        }
        if (left == null || right == null) {
            return false;
        }
        return left.equalsIgnoreCase(right);
    }

    private Object convertScanTarget(String targetType, Object match) {
        Map<String, Object> target = new LinkedHashMap<>();
        if (match instanceof Machine machine) {
            target.put("id", machine.getId());
            target.put("code", machine.getCode());
            target.put("name", machine.getName());
            target.put("status", machine.getStatus());
            target.put("location", machine.getLocation());
            target.put("factoryCode", machine.getFactoryCode());
            target.put("workshop", machine.getWorkshop());
        } else if (match instanceof Mold mold) {
            target.put("id", mold.getId());
            target.put("code", mold.getCode());
            target.put("name", mold.getName());
            target.put("status", mold.getStatus());
            target.put("lifetime", mold.getLifetime());
        } else if (match instanceof Product product) {
            target.put("id", product.getId());
            target.put("code", product.getCode());
            target.put("name", product.getName());
            target.put("spec", product.getSpec());
            target.put("unit", product.getUnit());
        } else if (match instanceof MaterialBatch batch) {
            target.put("id", batch.getId());
            target.put("batchNo", batch.getBatchNo());
            target.put("remainingQty", batch.getRemainingQty());
            target.put("expiryDate", batch.getExpiryDate());
            if (batch.getProductId() != null) {
                Product product = productMapper.selectById(batch.getProductId());
                if (product != null) {
                    target.put("productId", product.getId());
                    target.put("productCode", product.getCode());
                    target.put("productName", product.getName());
                }
            }
        }
        target.put("targetType", targetType);
        return target;
    }

    private Map<String, Object> buildLabel(String targetType, Object target) {
        Map<String, Object> label = new LinkedHashMap<>();
        label.put("targetType", targetType);
        if (target instanceof Machine machine) {
            label.put("title", "机台标签");
            label.put("code", machine.getCode());
            label.put("name", machine.getName());
            label.put("status", machine.getStatus());
            label.put("location", machine.getLocation());
            label.put("factoryCode", machine.getFactoryCode());
            label.put("workshop", machine.getWorkshop());
            label.put("qrCodeImage", machineService.generateQrCode(machine.getId()).getData());
        } else if (target instanceof Mold mold) {
            label.put("title", "模具标签");
            label.put("code", mold.getCode());
            label.put("name", mold.getName());
            label.put("cavities", mold.getCavities());
            label.put("lifetime", mold.getLifetime());
            label.put("maintenanceCycle", mold.getMaintenanceCycle());
        } else if (target instanceof Product product) {
            label.put("title", "产品标签");
            label.put("code", product.getCode());
            label.put("name", product.getName());
            label.put("spec", product.getSpec());
            label.put("unit", product.getUnit());
            label.put("piecePrice", product.getPiecePrice());
        } else if (target instanceof MaterialBatch batch) {
            label.put("title", "批次标签");
            label.put("batchNo", batch.getBatchNo());
            label.put("remainingQty", batch.getRemainingQty());
            label.put("expiryDate", batch.getExpiryDate());
            if (batch.getProductId() != null) {
                Product product = productMapper.selectById(batch.getProductId());
                if (product != null) {
                    label.put("productCode", product.getCode());
                    label.put("productName", product.getName());
                    label.put("unit", product.getUnit());
                }
            }
        }
        return label;
    }

    private Machine findMachineByCode(String code) {
        String normalized = code.trim();
        if (normalized.startsWith("MACHINE:")) {
            normalized = normalized.substring("MACHINE:".length());
        }
        Machine machine = machineMapper.selectOne(new LambdaQueryWrapper<Machine>()
                .eq(Machine::getCode, normalized));
        if (machine == null) {
            machine = machineMapper.selectOne(new LambdaQueryWrapper<Machine>()
                    .eq(Machine::getQrCode, code.trim()));
        }
        return machine;
    }

    private Mold findMoldByCode(String code) {
        String normalized = code.trim();
        if (normalized.startsWith("MOLD:")) {
            normalized = normalized.substring("MOLD:".length());
        }
        return moldMapper.selectOne(new LambdaQueryWrapper<Mold>().eq(Mold::getCode, normalized));
    }

    private Product findProductByCode(String code) {
        String normalized = code.trim();
        if (normalized.startsWith("PRODUCT:")) {
            normalized = normalized.substring("PRODUCT:".length());
        }
        return productMapper.selectOne(new LambdaQueryWrapper<Product>().eq(Product::getCode, normalized));
    }

    private MaterialBatch findBatchByCode(String code) {
        String normalized = code.trim();
        if (normalized.startsWith("BATCH:")) {
            normalized = normalized.substring("BATCH:".length());
        }
        return materialBatchMapper.selectOne(new LambdaQueryWrapper<MaterialBatch>().eq(MaterialBatch::getBatchNo, normalized));
    }
}
