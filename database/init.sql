-- ============================================================
-- 注塑厂综合管理系统（ERP + MES）数据库初始化脚本
-- 数据库：inject_erp
-- 字符集：utf8mb4
-- 创建日期：2026-06-17
-- 说明：包含31张业务表结构及初始数据
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS inject_erp DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE inject_erp;

-- ============================================================
-- 1. 系统用户表
-- ============================================================
CREATE TABLE sys_user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    real_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('BOSS','PROD_MANAGER','OPERATOR','QC','SALES','FINANCE') NOT NULL,
    status TINYINT DEFAULT 1 COMMENT '1启用 0禁用',
    login_fail_count INT DEFAULT 0,
    lock_until DATETIME COMMENT '锁定截止时间',
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT '系统用户表';

-- ============================================================
-- 2. 机台设备表
-- ============================================================
CREATE TABLE machine (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '机台编号 如IM-001',
    name VARCHAR(100) NOT NULL COMMENT '机台名称',
    model VARCHAR(100) COMMENT '机型 如海天MA1200',
    tonnage INT COMMENT '吨位',
    status ENUM('RUNNING','IDLE','MAINTENANCE','STOPPED') DEFAULT 'IDLE',
    qr_code VARCHAR(255) COMMENT '机台二维码内容',
    location VARCHAR(100) COMMENT '车间位置',
    factory_code VARCHAR(50) COMMENT '工厂编码',
    workshop VARCHAR(100) COMMENT '车间',
    purchase_date DATE,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '机台设备表';

-- ============================================================
-- 3. 模具表
-- ============================================================
CREATE TABLE mold (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '模具编号 如M-2024001',
    name VARCHAR(100) NOT NULL COMMENT '模具名称',
    product_id BIGINT COMMENT '关联产品',
    cavities INT NOT NULL COMMENT '穴数',
    lifetime INT COMMENT '设计寿命（模次）',
    used_shots INT DEFAULT 0 COMMENT '已使用模次',
    shots_since_maintenance INT DEFAULT 0 COMMENT '距上次保养已使用模次',
    maintenance_cycle INT COMMENT '保养周期（模次）',
    maintenance_count INT DEFAULT 0 COMMENT '保养次数',
    last_maintenance_at DATETIME COMMENT '上次保养时间',
    status ENUM('NORMAL','REPAIR','SCRAP') DEFAULT 'NORMAL',
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '模具表';

-- ============================================================
-- 4. 产品/物料表
-- ============================================================
CREATE TABLE product (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '物料编码',
    name VARCHAR(100) NOT NULL COMMENT '物料名称',
    spec VARCHAR(200) COMMENT '规格描述',
    type ENUM('RAW','SEMI','FINISH') NOT NULL COMMENT '原料/半成品/成品',
    unit VARCHAR(20) DEFAULT '个' COMMENT '计量单位',
    piece_price DECIMAL(10,4) COMMENT '计件单价（元/个）',
    cavity_yield INT COMMENT '每模产出数',
    cycle_time_sec INT COMMENT '标准成型周期（秒）',
    safe_stock INT DEFAULT 0 COMMENT '安全库存',
    weight_g DECIMAL(10,2) COMMENT '单件重量（克）',
    raw_material_id BIGINT COMMENT '关联原料（成品对应原料）',
    raw_material_usage DECIMAL(10,4) COMMENT '单件原料用量（克）',
    color VARCHAR(50) COMMENT '颜色',
    customer_id BIGINT COMMENT '专属客户（客定产品）',
    image_url VARCHAR(500) COMMENT '产品图片',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '产品/物料表';

-- ============================================================
-- 5. 客户表
-- ============================================================
CREATE TABLE customer (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '客户编号',
    name VARCHAR(100) NOT NULL COMMENT '客户名称',
    short_name VARCHAR(50) COMMENT '简称',
    contact VARCHAR(50) COMMENT '联系人',
    phone VARCHAR(20),
    address VARCHAR(500),
    tax_no VARCHAR(50) COMMENT '税号',
    invoice_title VARCHAR(200) COMMENT '开票抬头',
    credit_level ENUM('A','B','C') DEFAULT 'B' COMMENT '信用等级',
    payment_days INT DEFAULT 30 COMMENT '账期（天）',
    sales_user_id BIGINT COMMENT '负责销售员',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '客户表';

-- ============================================================
-- 6. 供应商表
-- ============================================================
CREATE TABLE supplier (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    contact VARCHAR(50),
    phone VARCHAR(20),
    address VARCHAR(500),
    main_material VARCHAR(200) COMMENT '主营原料',
    status TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '供应商表';

-- ============================================================
-- 7. 销售订单主表
-- ============================================================
CREATE TABLE sale_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '订单号 如SO20260617001',
    customer_id BIGINT NOT NULL,
    order_date DATE NOT NULL,
    delivery_date DATE COMMENT '要求交期',
    total_amount DECIMAL(12,2) COMMENT '订单总金额',
    received_amount DECIMAL(12,2) DEFAULT 0 COMMENT '已回款金额',
    status ENUM('DRAFT','CONFIRMED','PRODUCING','DELIVERED','CLOSED','CANCELLED') DEFAULT 'DRAFT',
    sales_user_id BIGINT COMMENT '销售员',
    remark TEXT,
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT '销售订单主表';

-- ============================================================
-- 8. 销售订单明细表
-- ============================================================
CREATE TABLE sale_order_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    sale_order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    qty INT NOT NULL COMMENT '订购数量',
    unit_price DECIMAL(10,4) COMMENT '单价',
    amount DECIMAL(12,2) COMMENT '金额',
    delivered_qty INT DEFAULT 0 COMMENT '已发货数量',
    produced_qty INT DEFAULT 0 COMMENT '已生产数量',
    remark VARCHAR(500),
    INDEX idx_sale_order (sale_order_id)
) COMMENT '销售订单明细表';

-- ============================================================
-- 9. 生产工单表
-- ============================================================
CREATE TABLE prod_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(50) NOT NULL UNIQUE COMMENT '工单号 如PO20260617001',
    sale_order_id BIGINT COMMENT '关联销售订单',
    sale_order_item_id BIGINT COMMENT '关联订单明细',
    product_id BIGINT NOT NULL,
    machine_id BIGINT,
    mold_id BIGINT,
    plan_qty INT NOT NULL COMMENT '计划数量',
    completed_qty INT DEFAULT 0 COMMENT '完工数量',
    qualified_qty INT DEFAULT 0 COMMENT '合格数量',
    bad_qty INT DEFAULT 0 COMMENT '不良数量',
    raw_material_qty DECIMAL(10,2) COMMENT '需领原料量（克）',
    plan_start DATETIME COMMENT '计划开始',
    plan_end DATETIME COMMENT '计划结束',
    actual_start DATETIME COMMENT '实际开始',
    actual_end DATETIME COMMENT '实际结束',
    status ENUM('WAITING','SCHEDULED','RUNNING','PAUSED','FINISHED','CLOSED') DEFAULT 'WAITING',
    priority INT DEFAULT 5 COMMENT '优先级 1最高 9最低',
    remark TEXT,
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT '生产工单表';

-- ============================================================
-- 10. 报工记录表
-- ============================================================
CREATE TABLE prod_report (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    prod_order_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL COMMENT '操作工',
    machine_id BIGINT NOT NULL,
    mold_id BIGINT,
    report_type ENUM('START','OUTPUT','END') NOT NULL,
    shift ENUM('DAY','NIGHT') COMMENT '班次',
    qty INT DEFAULT 0 COMMENT '本班产量',
    bad_qty INT DEFAULT 0 COMMENT '本班不良数',
    shots INT DEFAULT 0 COMMENT '本班模次',
    start_time DATETIME,
    end_time DATETIME,
    work_minutes INT COMMENT '工作分钟数',
    sync_status TINYINT DEFAULT 1 COMMENT '0离线 1已同步',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order (prod_order_id),
    INDEX idx_user_date (user_id, created_at)
) COMMENT '报工记录表';

-- ============================================================
-- 11. 模具上下模记录表
-- ============================================================
CREATE TABLE mold_mount_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    mold_id BIGINT NOT NULL,
    machine_id BIGINT NOT NULL,
    prod_order_id BIGINT,
    mount_type ENUM('MOUNT','DISMOUNT') NOT NULL,
    operator_id BIGINT COMMENT '操作人',
    operate_time DATETIME NOT NULL,
    remark TEXT,
    INDEX idx_mold (mold_id),
    INDEX idx_machine (machine_id),
    INDEX idx_operate_time (operate_time)
) COMMENT '模具上下模记录表';

-- ============================================================
-- 12. ???????
-- ============================================================
CREATE TABLE mold_maintenance_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    mold_id BIGINT NOT NULL,
    operator_id BIGINT,
    used_shots_before INT NOT NULL COMMENT '???????',
    shots_since_maintenance_before INT NOT NULL COMMENT '??????????',
    maintenance_count_before INT NOT NULL COMMENT '?????',
    operate_time DATETIME NOT NULL,
    remark TEXT,
    INDEX idx_mold (mold_id),
    INDEX idx_operator (operator_id),
    INDEX idx_operate_time (operate_time)
) COMMENT '???????';

-- ============================================================
-- ============================================================
-- 12.1 设备点检记录表
-- ============================================================
CREATE TABLE machine_inspection_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    machine_id BIGINT NOT NULL,
    inspector_id BIGINT NOT NULL,
    inspect_time DATETIME NOT NULL,
    result ENUM('PASS','FAIL') NOT NULL,
    items_checked VARCHAR(500) COMMENT '点检项目',
    issues VARCHAR(500) COMMENT '异常描述',
    remark TEXT,
    INDEX idx_machine (machine_id),
    INDEX idx_inspector (inspector_id),
    INDEX idx_inspect_time (inspect_time)
) COMMENT '设备点检记录表';

-- ============================================================
-- 13. 停机记录表
-- ============================================================
CREATE TABLE downtime_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    prod_order_id BIGINT,
    machine_id BIGINT NOT NULL,
    reason ENUM('MOLD_CHANGE','MATERIAL_SHORTAGE','QUALITY_ISSUE','EQUIPMENT_FAULT','BREAK','OTHER') NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration_minutes INT COMMENT '停机时长（分钟）',
    operator_id BIGINT,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '停机记录表';

-- ============================================================
-- 14. 质检记录表
-- ============================================================
CREATE TABLE qc_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    prod_order_id BIGINT,
    product_id BIGINT NOT NULL,
    check_type ENUM('IQC','FAI','IPQC','FQC') NOT NULL,
    check_result ENUM('PASS','FAIL','CONDITIONAL') NOT NULL,
    defect_type VARCHAR(50) COMMENT '缺陷类型',
    defect_desc VARCHAR(500) COMMENT '缺陷描述',
    defect_qty INT DEFAULT 0,
    sample_qty INT COMMENT '抽样数量',
    checker_id BIGINT NOT NULL,
    check_time DATETIME NOT NULL,
    image_urls VARCHAR(1000) COMMENT '质检照片URL（逗号分隔）',
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order (prod_order_id),
    INDEX idx_product (product_id)
) COMMENT '质检记录表';

-- ============================================================
-- 15. 仓库表
-- ============================================================
CREATE TABLE warehouse (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE COMMENT '仓库编码 如W-RAW',
    name VARCHAR(100) NOT NULL COMMENT '仓库名称',
    type ENUM('RAW','SEMI','FINISH','DEFECT','SCRAP') NOT NULL COMMENT '仓库类型',
    address VARCHAR(200),
    factory_code VARCHAR(50) COMMENT '工厂编码',
    workshop VARCHAR(100) COMMENT '车间',
    manager_id BIGINT COMMENT '仓库负责人',
    is_enabled TINYINT DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '仓库表';

-- ============================================================
-- 16. 库位表
-- ============================================================
CREATE TABLE warehouse_location (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    warehouse_id BIGINT NOT NULL,
    code VARCHAR(50) NOT NULL COMMENT '库位编码 如A-01-01',
    name VARCHAR(100),
    area VARCHAR(50) COMMENT '库区',
    shelf VARCHAR(50) COMMENT '货架',
    layer INT COMMENT '层数',
    position INT COMMENT '位置',
    is_enabled TINYINT DEFAULT 1,
    UNIQUE KEY uk_wh_location (warehouse_id, code)
) COMMENT '库位表';

-- ============================================================
-- 17. 物料批次表
-- ============================================================
CREATE TABLE material_batch (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    batch_no VARCHAR(50) NOT NULL UNIQUE COMMENT '批次号',
    product_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL,
    supplier_id BIGINT COMMENT '供应商',
    production_date DATE COMMENT '生产日期/来料日期',
    expiry_date DATE COMMENT '有效期至',
    initial_qty INT COMMENT '初始数量',
    remaining_qty INT DEFAULT 0 COMMENT '剩余数量',
    status ENUM('NORMAL','LOCKED','EXPIRED','RETURNED') DEFAULT 'NORMAL',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_product (product_id),
    INDEX idx_batch_no (batch_no)
) COMMENT '物料批次表';

-- ============================================================
-- 18. 库存表
-- ============================================================
CREATE TABLE stock (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL,
    location_id BIGINT COMMENT '库位ID',
    batch_id BIGINT COMMENT '批次ID（原料/成品批次管理时必填）',
    qty INT DEFAULT 0 COMMENT '当前库存数量',
    locked_qty INT DEFAULT 0 COMMENT '锁定数量（已分配工单）',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_stock (product_id, warehouse_id, location_id, batch_id)
) COMMENT '库存表';

-- ============================================================
-- 19. 库存流水表
-- ============================================================
CREATE TABLE stock_move (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    move_no VARCHAR(50) NOT NULL UNIQUE COMMENT '流水号',
    product_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL,
    location_id BIGINT COMMENT '库位ID',
    batch_id BIGINT COMMENT '批次ID',
    to_warehouse_id BIGINT COMMENT '目标仓库ID（调拨时）',
    to_location_id BIGINT COMMENT '目标库位ID（调拨时）',
    to_batch_id BIGINT COMMENT '目标批次ID（调拨时）',
    move_type ENUM('IN','OUT','TRANSFER') NOT NULL,
    move_reason ENUM('PURCHASE','PICKING','PRODUCE_IN','SALE_OUT','RETURN','INVENTORY_ADJ','TRANSFER','DEFECT') NOT NULL,
    qty INT NOT NULL,
    related_order_id BIGINT COMMENT '关联单据ID',
    related_order_type ENUM('SALE_ORDER','PROD_ORDER','PURCHASE_ORDER','TRANSFER','INVENTORY') COMMENT '关联单据类型',
    operator_id BIGINT,
    operate_time DATETIME NOT NULL,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_warehouse (warehouse_id),
    INDEX idx_product (product_id)
) COMMENT '库存流水表';

-- ============================================================
-- 20. 调拨单主表
-- ============================================================
CREATE TABLE stock_transfer (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    transfer_no VARCHAR(50) NOT NULL UNIQUE COMMENT '调拨单号',
    from_warehouse_id BIGINT NOT NULL,
    to_warehouse_id BIGINT NOT NULL,
    status ENUM('DRAFT','SHIPPED','RECEIVED','CLOSED') DEFAULT 'DRAFT',
    operator_id BIGINT,
    receive_time DATETIME,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '调拨单主表';

-- ============================================================
-- 21. 调拨单明细表
-- ============================================================
CREATE TABLE stock_transfer_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    transfer_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    from_location_id BIGINT,
    to_location_id BIGINT,
    from_batch_id BIGINT,
    qty INT NOT NULL,
    received_qty INT DEFAULT 0,
    remark VARCHAR(500),
    INDEX idx_transfer (transfer_id)
) COMMENT '调拨单明细表';

-- ============================================================
-- 22. 盘点单主表
-- ============================================================
CREATE TABLE stock_inventory (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    inventory_no VARCHAR(50) NOT NULL UNIQUE COMMENT '盘点单号',
    warehouse_id BIGINT NOT NULL,
    inventory_type ENUM('FULL','PARTIAL') NOT NULL COMMENT '全盘/抽盘',
    status ENUM('DRAFT','COUNTING','PENDING_APPROVE','FINISHED','CANCELLED') DEFAULT 'DRAFT',
    freeze_stock TINYINT DEFAULT 0 COMMENT '是否冻结库存',
    operator_id BIGINT,
    approver_id BIGINT,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '盘点单主表';

-- ============================================================
-- 23. 盘点单明细表
-- ============================================================
CREATE TABLE stock_inventory_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    inventory_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    location_id BIGINT,
    batch_id BIGINT,
    book_qty INT DEFAULT 0 COMMENT '账面数量',
    actual_qty INT DEFAULT 0 COMMENT '实盘数量',
    diff_qty INT DEFAULT 0 COMMENT '差异数量',
    diff_amount DECIMAL(12,2) COMMENT '差异金额',
    reason VARCHAR(200) COMMENT '差异原因',
    INDEX idx_inventory (inventory_id)
) COMMENT '盘点单明细表';

-- ============================================================
-- 24. 计件单价表
-- ============================================================
CREATE TABLE piece_price (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id BIGINT NOT NULL,
    process_name VARCHAR(50) DEFAULT '注塑' COMMENT '工序名称',
    price DECIMAL(10,4) NOT NULL COMMENT '单价（元/个）',
    effective_date DATE NOT NULL COMMENT '生效日期',
    expire_date DATE COMMENT '失效日期',
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_product (product_id)
) COMMENT '计件单价表';

-- ============================================================
-- 25. 日工资表
-- ============================================================
CREATE TABLE salary_daily (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    work_date DATE NOT NULL,
    total_qualified_qty INT DEFAULT 0 COMMENT '当日合格品总数',
    total_piece_amount DECIMAL(10,4) DEFAULT 0 COMMENT '计件工资合计',
    subsidy DECIMAL(10,4) DEFAULT 0 COMMENT '补贴',
    deduction DECIMAL(10,4) DEFAULT 0 COMMENT '扣款',
    total_amount DECIMAL(10,4) DEFAULT 0 COMMENT '当日工资总额',
    status ENUM('DRAFT','CONFIRMED') DEFAULT 'DRAFT',
    confirmed_by BIGINT,
    confirmed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_date (user_id, work_date)
) COMMENT '日工资表';

-- ============================================================
-- 26. 工资调整表（奖惩/扣款）
-- ============================================================
CREATE TABLE salary_adjust (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    adjust_type ENUM('BONUS','PENALTY','OVERTIME','SUBSIDY','OTHER') NOT NULL,
    amount DECIMAL(10,4) NOT NULL COMMENT '金额（正为加、负为减）',
    adjust_date DATE NOT NULL,
    reason VARCHAR(500),
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '工资调整表';

-- ============================================================
-- 27. 回款记录表
-- ============================================================
CREATE TABLE payment_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    payment_no VARCHAR(50) NOT NULL UNIQUE COMMENT '回款单号',
    customer_id BIGINT NOT NULL,
    sale_order_id BIGINT,
    pay_amount DECIMAL(12,2) NOT NULL,
    pay_date DATE NOT NULL,
    pay_method ENUM('CASH','BANK_TRANSFER','WECHAT','ALIPAY','ACCEPTANCE') NOT NULL,
    invoice_no VARCHAR(50) COMMENT '发票号',
    remark TEXT,
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '回款记录表';

-- ============================================================
-- 28. 发货单表
-- ============================================================
CREATE TABLE delivery_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    delivery_no VARCHAR(50) NOT NULL UNIQUE COMMENT '发货单号',
    sale_order_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    delivery_date DATE NOT NULL,
    total_qty INT COMMENT '发货总数',
    logistics_company VARCHAR(100) COMMENT '物流公司',
    tracking_no VARCHAR(100) COMMENT '物流单号',
    status ENUM('PENDING','SHIPPED','RECEIVED') DEFAULT 'PENDING',
    operator_id BIGINT,
    remark TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '发货单表';

-- ============================================================
-- 29. 发货单明细表
-- ============================================================
CREATE TABLE delivery_order_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    delivery_order_id BIGINT NOT NULL,
    sale_order_item_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    qty INT NOT NULL,
    INDEX idx_delivery (delivery_order_id)
) COMMENT '发货单明细表';

-- ============================================================
-- 30. 费用支出表
-- ============================================================
CREATE TABLE expense_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    expense_no VARCHAR(50) NOT NULL UNIQUE,
    expense_type ENUM('RENT','ELECTRICITY','WATER','MATERIAL','MAINTENANCE','SALARY','OTHER') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL,
    payee VARCHAR(100) COMMENT '收款方',
    remark TEXT,
    created_by BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) COMMENT '费用支出表';

-- ============================================================
-- 31. 操作日志表
-- ============================================================
CREATE TABLE sys_operation_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT,
    username VARCHAR(50),
    module VARCHAR(50) COMMENT '模块名',
    action VARCHAR(50) COMMENT '操作类型',
    target_type VARCHAR(50) COMMENT '操作对象类型',
    target_id BIGINT COMMENT '操作对象ID',
    old_value TEXT COMMENT '修改前值（JSON）',
    new_value TEXT COMMENT '修改后值（JSON）',
    ip VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_time (created_at),
    INDEX idx_user (user_id)
) COMMENT '操作日志表';

-- ============================================================
-- 32. 系统配置表
-- ============================================================
CREATE TABLE sys_config (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    config_desc VARCHAR(500),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT '系统配置表';

-- ============================================================
-- 33. 通知消息表
-- ============================================================
CREATE TABLE notification (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL COMMENT '接收用户ID',
    title VARCHAR(200) NOT NULL COMMENT '通知标题',
    content TEXT NOT NULL COMMENT '通知内容',
    type ENUM('WARNING','INFO','ERROR') NOT NULL DEFAULT 'INFO' COMMENT '通知类型',
    is_read TINYINT DEFAULT 0 COMMENT '是否已读 0未读 1已读',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_type (type),
    INDEX idx_is_read (is_read),
    INDEX idx_created_at (created_at)
) COMMENT '通知消息表';

-- ============================================================
-- 34. 单据序号表（并发安全的单据号分配）
-- ============================================================
CREATE TABLE seq_number (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    seq_type VARCHAR(20) NOT NULL COMMENT '序号类型编码，如 SO/PO/DO/PAY/EXP/TR/IV/SM/BATCH',
    seq_date DATE NOT NULL COMMENT '当前日期',
    current_seq INT NOT NULL DEFAULT 0 COMMENT '当前序号值',
    UNIQUE KEY uk_type_date (seq_type, seq_date)
) COMMENT '单据序号表';

-- ============================================================
-- 初始数据插入
-- ============================================================

-- -----------------------------------------------------------
-- 2. 插入管理员账号 songjian（密码：123456，BCrypt加密）
-- -----------------------------------------------------------
INSERT INTO sys_user (username, real_name, phone, password_hash, role, status)
VALUES ('songjian', '宋建', '13800000000', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', 'BOSS', 1);

-- -----------------------------------------------------------
-- 3. 插入4个默认仓库
-- -----------------------------------------------------------
INSERT INTO warehouse (code, name, type, address) VALUES
('W-RAW', '原料仓', 'RAW', 'A区'),
('W-SEMI', '半成品仓', 'SEMI', 'C区'),
('W-FINISH', '成品仓', 'FINISH', 'D区'),
('W-DEFECT', '不良品仓', 'DEFECT', 'E区');

-- -----------------------------------------------------------
-- 4. 插入3台示例注塑机
-- -----------------------------------------------------------
INSERT INTO machine (code, name, model, tonnage, status, location) VALUES
('IM-001', '1号注塑机', '海天MA1200', 120, 'IDLE', 'A车间'),
('IM-002', '2号注塑机', '海天MA1600', 160, 'IDLE', 'A车间'),
('IM-003', '3号注塑机', '海天MA2000', 200, 'IDLE', 'B车间');

-- -----------------------------------------------------------
-- 5. 插入系统配置项（17项默认配置）
-- -----------------------------------------------------------
INSERT INTO sys_config (config_key, config_value, config_desc) VALUES
('system_title', '注塑厂管理系统', '系统标题'),
('factory_name', 'XX注塑厂', '工厂名称，显示在系统标题'),
('shift_day_start', '08:00', '白班开始时间'),
('shift_night_start', '20:00', '夜班开始时间'),
('overtime_threshold_min', '480', '日工时超此值计加班（分钟）'),
('bad_rate_warning', '5', '不良率预警阈值（%）'),
('delivery_warning_days', '3', '交期预警天数'),
('stock_warning_enabled', 'true', '是否启用库存预警'),
('auto_daily_settle', 'true', '是否自动日结工资'),
('backup_time', '02:00', '自动备份时间'),
('backup_keep_days', '30', '备份保留天数'),
('piece_price_tolerance', '5', '报工超计划数量容差（%）'),
('fifo_enabled', 'true', '是否启用原料先进先出'),
('inventory_freeze_on_count', 'true', '盘点时是否冻结库存'),
('location_capacity_check', 'false', '是否启用库位容量校验'),
('default_raw_warehouse', '1', '默认原料仓ID'),
('default_finish_warehouse', '3', '默认成品仓ID'),
('mold_maintenance_warning_ratio', '0.8', '模具保养预警比例（达到保养周期的百分比时预警）'),
('external_push_enabled', 'false', '是否启用外部消息推送'),
('wecom_webhook_url', '', '企业微信 Webhook'),
('dingtalk_webhook_url', '', '钉钉 Webhook');
