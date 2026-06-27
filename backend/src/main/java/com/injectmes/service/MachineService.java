package com.injectmes.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.injectmes.common.R;
import com.injectmes.dto.req.MachineCreateRequest;
import com.injectmes.dto.req.MachineUpdateRequest;
import com.injectmes.dto.req.PageRequest;
import com.injectmes.dto.resp.MachineResponse;
import com.injectmes.dto.resp.PageResponse;
import com.injectmes.entity.Machine;
import com.injectmes.exception.BusinessException;
import com.injectmes.mapper.MachineMapper;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 机台设备服务
 */
@Service
public class MachineService {

    /** 二维码图片宽度 */
    private static final int QR_CODE_WIDTH = 300;

    /** 二维码图片高度 */
    private static final int QR_CODE_HEIGHT = 300;

    @Autowired
    private MachineMapper machineMapper;

    /**
     * 分页查询机台列表
     * 支持keyword模糊搜索code/name
     *
     * @param request 分页请求
     * @return 分页响应
     */
    public R<PageResponse<MachineResponse>> list(PageRequest request) {
        Page<Machine> page = new Page<>(request.getPage(), request.getSize());

        LambdaQueryWrapper<Machine> wrapper = new LambdaQueryWrapper<>();

        // 关键词模糊搜索
        String keyword = request.getKeyword();
        if (keyword != null && !keyword.trim().isEmpty()) {
            wrapper.and(w -> w
                    .like(Machine::getCode, keyword)
                    .or().like(Machine::getName, keyword)
            );
        }

        if (request.getStatus() != null && !request.getStatus().trim().isEmpty()) {
            wrapper.eq(Machine::getStatus, normalizeStatus(request.getStatus(), null));
        }
        if (request.getFactoryCode() != null && !request.getFactoryCode().trim().isEmpty()) {
            wrapper.eq(Machine::getFactoryCode, request.getFactoryCode().trim());
        }
        if (request.getWorkshop() != null && !request.getWorkshop().trim().isEmpty()) {
            wrapper.like(Machine::getWorkshop, request.getWorkshop().trim());
        }

        // 按创建时间降序
        wrapper.orderByDesc(Machine::getCreatedAt);

        Page<Machine> result = machineMapper.selectPage(page, wrapper);

        // 转换为响应DTO
        List<MachineResponse> records = result.getRecords().stream()
                .map(this::convertToResponse)
                .collect(Collectors.toList());

        PageResponse<MachineResponse> pageResponse = new PageResponse<>();
        pageResponse.setRecords(records);
        pageResponse.setTotal(result.getTotal());
        pageResponse.setPage(request.getPage());
        pageResponse.setSize(request.getSize());

        return R.ok(pageResponse);
    }

    /**
     * 根据ID查询机台
     *
     * @param id 机台ID
     * @return 机台响应
     */
    public R<MachineResponse> getById(Long id) {
        Machine machine = machineMapper.selectById(id);
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }
        return R.ok(convertToResponse(machine));
    }

    /**
     * 创建机台
     * 自动生成二维码内容
     *
     * @param request 创建机台请求
     * @return 机台响应
     */
    @Transactional
    public R<MachineResponse> create(MachineCreateRequest request) {
        // 检查编码是否已存在
        Long count = machineMapper.selectCount(
                new LambdaQueryWrapper<Machine>().eq(Machine::getCode, request.getCode())
        );
        if (count > 0) {
            throw new BusinessException("机台编码已存在");
        }

        Machine machine = new Machine();
        BeanUtils.copyProperties(request, machine);
        // tonnage类型转换：BigDecimal -> Integer（实体中为Integer）
        if (request.getTonnage() != null) {
            machine.setTonnage(request.getTonnage().intValue());
        }
        machine.setStatus(normalizeStatus(request.getStatus(), "IDLE"));
        if (request.getFactoryCode() != null) {
            machine.setFactoryCode(request.getFactoryCode());
        }
        if (request.getWorkshop() != null) {
            machine.setWorkshop(request.getWorkshop());
        }
        // 自动生成二维码内容
        machine.setQrCode(request.getQrCode() != null && !request.getQrCode().trim().isEmpty()
                ? request.getQrCode().trim()
                : "MACHINE:" + request.getCode());
        machine.setCreatedAt(LocalDateTime.now());

        machineMapper.insert(machine);

        return R.ok("创建成功", convertToResponse(machine));
    }

    /**
     * 更新机台
     *
     * @param id      机台ID
     * @param request 更新机台请求
     * @return 机台响应
     */
    @Transactional
    public R<MachineResponse> update(Long id, MachineUpdateRequest request) {
        Machine machine = machineMapper.selectById(id);
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }

        // 更新非空字段
        if (request.getName() != null) {
            machine.setName(request.getName());
        }
        if (request.getModel() != null) {
            machine.setModel(request.getModel());
        }
        if (request.getTonnage() != null) {
            machine.setTonnage(request.getTonnage().intValue());
        }
        if (request.getStatus() != null) {
            machine.setStatus(normalizeStatus(request.getStatus(), machine.getStatus()));
        }
        if (request.getLocation() != null) {
            machine.setLocation(request.getLocation());
        }
        if (request.getFactoryCode() != null) {
            machine.setFactoryCode(request.getFactoryCode());
        }
        if (request.getWorkshop() != null) {
            machine.setWorkshop(request.getWorkshop());
        }
        if (request.getPurchaseDate() != null) {
            machine.setPurchaseDate(request.getPurchaseDate());
        }
        if (request.getRemark() != null) {
            machine.setRemark(request.getRemark());
        }

        machineMapper.updateById(machine);

        return R.ok("更新成功", convertToResponse(machine));
    }

    /**
     * 删除机台
     *
     * @param id 机台ID
     * @return 操作结果
     */
    @Transactional
    public R<Void> delete(Long id) {
        Machine machine = machineMapper.selectById(id);
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }

        machineMapper.deleteById(id);

        return R.ok("删除成功", null);
    }

    /**
     * 生成二维码
     * 返回二维码图片Base64
     *
     * @param id 机台ID
     * @return 二维码Base64字符串
     */
    @Transactional
    public R<String> generateQrCode(Long id) {
        Machine machine = machineMapper.selectById(id);
        if (machine == null) {
            throw new BusinessException("机台不存在");
        }

        // 如果没有二维码内容，自动生成
        String qrContent = machine.getQrCode();
        if (qrContent == null || qrContent.isEmpty()) {
            qrContent = "MACHINE:" + machine.getCode();
            machine.setQrCode(qrContent);
            machineMapper.updateById(machine);
        }

        try {
            // 使用ZXing生成二维码
            QRCodeWriter qrCodeWriter = new QRCodeWriter();
            BitMatrix bitMatrix = qrCodeWriter.encode(qrContent, BarcodeFormat.QR_CODE, QR_CODE_WIDTH, QR_CODE_HEIGHT);

            // 转换为图片并编码为Base64
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(bitMatrix, "PNG", outputStream);
            String base64Image = Base64.getEncoder().encodeToString(outputStream.toByteArray());

            return R.ok("data:image/png;base64," + base64Image);
        } catch (WriterException | IOException e) {
            throw new BusinessException("二维码生成失败：" + e.getMessage());
        }
    }

    /**
     * 实体转响应DTO
     */
    private MachineResponse convertToResponse(Machine machine) {
        MachineResponse response = new MachineResponse();
        BeanUtils.copyProperties(machine, response);
        // tonnage类型转换：Integer -> BigDecimal（响应中为BigDecimal）
        if (machine.getTonnage() != null) {
            response.setTonnage(java.math.BigDecimal.valueOf(machine.getTonnage()));
        }
        return response;
    }

    private String normalizeStatus(String status, String defaultStatus) {
        if (status == null || status.trim().isEmpty()) {
            return defaultStatus;
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        if (!"RUNNING".equals(normalized)
                && !"IDLE".equals(normalized)
                && !"MAINTENANCE".equals(normalized)
                && !"STOPPED".equals(normalized)) {
            throw new BusinessException("不支持的机台状态");
        }
        return normalized;
    }
}
