-- ============================================================
-- 注塑厂综合管理系统（ERP + MES）数据库初始化脚本
-- 数据库：inject_erp
-- 字符集：utf8mb4
-- 创建日期：2026-06-17
-- 说明：包含31张业务表结构及初始数据
-- ============================================================

-- 创建数据库
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. 系统用户表
-- ============================================================
CREATE TABLE sys_user (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    real_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(64) NOT NULL,
    status SMALLINT DEFAULT 1,
    login_fail_count INT DEFAULT 0,
    lock_until TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. 机台设备表
-- ============================================================
CREATE TABLE machine (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    tonnage INT,
    status VARCHAR(64) DEFAULT 'IDLE',
    qr_code VARCHAR(255),
    location VARCHAR(100),
    factory_code VARCHAR(50),
    workshop VARCHAR(100),
    purchase_date DATE,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. 模具表
-- ============================================================
CREATE TABLE mold (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    product_id BIGINT,
    cavities INT NOT NULL,
    lifetime INT,
    used_shots INT DEFAULT 0,
    shots_since_maintenance INT DEFAULT 0,
    maintenance_cycle INT,
    maintenance_count INT DEFAULT 0,
    last_maintenance_at TIMESTAMP,
    status VARCHAR(64) DEFAULT 'NORMAL',
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. 产品/物料表
-- ============================================================
CREATE TABLE product (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    spec VARCHAR(200),
    type VARCHAR(64) NOT NULL,
    unit VARCHAR(20) DEFAULT '个',
    piece_price DECIMAL(10,4),
    cavity_yield INT,
    cycle_time_sec INT,
    safe_stock INT DEFAULT 0,
    weight_g DECIMAL(10,2),
    raw_material_id BIGINT,
    raw_material_usage DECIMAL(10,4),
    color VARCHAR(50),
    customer_id BIGINT,
    image_url VARCHAR(500),
    status SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. 客户表
-- ============================================================
CREATE TABLE customer (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    short_name VARCHAR(50),
    contact VARCHAR(50),
    phone VARCHAR(20),
    address VARCHAR(500),
    tax_no VARCHAR(50),
    invoice_title VARCHAR(200),
    credit_level VARCHAR(64) DEFAULT 'B',
    payment_days INT DEFAULT 30,
    sales_user_id BIGINT,
    status SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE product
    ADD CONSTRAINT fk_product_customer FOREIGN KEY (customer_id) REFERENCES customer(id);

-- ============================================================
-- 6. 供应商表
-- ============================================================
CREATE TABLE supplier (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    contact VARCHAR(50),
    phone VARCHAR(20),
    address VARCHAR(500),
    main_material VARCHAR(200),
    status SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. 销售订单主表
-- ============================================================
CREATE TABLE sale_order (
    id BIGSERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL REFERENCES customer(id),
    order_date DATE NOT NULL,
    delivery_date DATE,
    total_amount DECIMAL(12,2),
    received_amount DECIMAL(12,2) DEFAULT 0,
    received_opening_amount DECIMAL(12,2) DEFAULT 0,
    status VARCHAR(64) DEFAULT 'DRAFT',
    sales_user_id BIGINT,
    remark TEXT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_sale_order_amounts CHECK (
        COALESCE(total_amount, 0) >= 0
        AND COALESCE(received_amount, 0) >= 0
        AND COALESCE(received_opening_amount, 0) >= 0
        AND COALESCE(received_amount, 0) <= COALESCE(total_amount, 0)
    )
);

-- ============================================================
-- 8. 销售订单明细表
-- ============================================================
CREATE TABLE sale_order_item (
    id BIGSERIAL PRIMARY KEY,
    sale_order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    qty INT NOT NULL,
    unit_price DECIMAL(10,4),
    amount DECIMAL(12,2),
    delivered_qty INT DEFAULT 0,
    produced_qty INT DEFAULT 0,
    remark VARCHAR(500)
);

-- ============================================================
-- 9. 生产工单表
-- ============================================================
CREATE TABLE prod_order (
    id BIGSERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE,
    sale_order_id BIGINT,
    sale_order_item_id BIGINT,
    product_id BIGINT NOT NULL,
    machine_id BIGINT,
    mold_id BIGINT,
    plan_qty INT NOT NULL,
    completed_qty INT DEFAULT 0,
    qualified_qty INT DEFAULT 0,
    bad_qty INT DEFAULT 0,
    raw_material_qty DECIMAL(10,2),
    picked_material_qty DECIMAL(10,2) DEFAULT 0,
    picked_material_amount DECIMAL(14,2) DEFAULT 0,
    inbounded_qty DECIMAL(10,2) DEFAULT 0,
    inbounded_amount DECIMAL(14,2) DEFAULT 0,
    plan_start TIMESTAMP,
    plan_end TIMESTAMP,
    actual_start TIMESTAMP,
    actual_end TIMESTAMP,
    status VARCHAR(64) DEFAULT 'WAITING',
    priority INT DEFAULT 5,
    remark TEXT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 10. 报工记录表
-- ============================================================
CREATE TABLE prod_report (
    id BIGSERIAL PRIMARY KEY,
    prod_order_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    machine_id BIGINT NOT NULL,
    mold_id BIGINT,
    report_type VARCHAR(64) NOT NULL,
    process_name VARCHAR(50) NOT NULL DEFAULT '注塑',
    shift VARCHAR(64),
    qty INT DEFAULT 0,
    bad_qty INT DEFAULT 0,
    shots INT DEFAULT 0,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    work_minutes INT,
    sync_status SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_prod_report_process_name CHECK (length(btrim(process_name)) BETWEEN 1 AND 50)
);
CREATE INDEX idx_prod_report_order_process_time ON prod_report (prod_order_id, process_name, start_time);

-- ============================================================
-- 11. 停机记录表
-- ============================================================
CREATE TABLE downtime_record (
    id BIGSERIAL PRIMARY KEY,
    prod_order_id BIGINT,
    machine_id BIGINT NOT NULL,
    reason VARCHAR(64) NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_minutes INT,
    operator_id BIGINT,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. 上下模记录表
-- ============================================================
CREATE TABLE mold_mount_record (
    id BIGSERIAL PRIMARY KEY,
    mold_id BIGINT NOT NULL,
    machine_id BIGINT NOT NULL,
    prod_order_id BIGINT,
    mount_type VARCHAR(64) NOT NULL,
    operator_id BIGINT,
    operate_time TIMESTAMP NOT NULL,
    remark TEXT
);

-- ============================================================
-- 13. 模具保养记录表
-- ============================================================
CREATE TABLE mold_maintenance_record (
    id BIGSERIAL PRIMARY KEY,
    mold_id BIGINT NOT NULL,
    operator_id BIGINT,
    used_shots_before INT NOT NULL,
    shots_since_maintenance_before INT NOT NULL,
    maintenance_count_before INT NOT NULL,
    operate_time TIMESTAMP NOT NULL,
    remark TEXT
);

-- ============================================================
-- 14. 设备点检记录表
-- ============================================================
CREATE TABLE machine_inspection_record (
    id BIGSERIAL PRIMARY KEY,
    machine_id BIGINT NOT NULL,
    inspector_id BIGINT NOT NULL,
    inspect_time TIMESTAMP NOT NULL,
    result VARCHAR(64) NOT NULL,
    items_checked VARCHAR(500),
    issues VARCHAR(500),
    remark TEXT
);

-- ============================================================
-- 15. 质检记录表
-- ============================================================
CREATE TABLE qc_record (
    id BIGSERIAL PRIMARY KEY,
    prod_order_id BIGINT,
    product_id BIGINT NOT NULL,
    check_type VARCHAR(64) NOT NULL,
    check_result VARCHAR(64) NOT NULL,
    defect_type VARCHAR(50),
    defect_desc VARCHAR(500),
    defect_qty INT DEFAULT 0,
    sample_qty INT,
    checker_id BIGINT NOT NULL,
    check_time TIMESTAMP NOT NULL,
    image_urls VARCHAR(1000),
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 16. 仓库表
-- ============================================================
CREATE TABLE warehouse (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(64) NOT NULL,
    address VARCHAR(200),
    factory_code VARCHAR(50),
    workshop VARCHAR(100),
    manager_id BIGINT,
    is_enabled SMALLINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 17. 库位表
-- ============================================================
CREATE TABLE warehouse_location (
    id BIGSERIAL PRIMARY KEY,
    warehouse_id BIGINT NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    area VARCHAR(50),
    shelf VARCHAR(50),
    layer INT,
    position INT,
    is_enabled SMALLINT DEFAULT 1,
    CONSTRAINT uk_wh_location UNIQUE (warehouse_id, code)
);

-- ============================================================
-- 17.1 库存表
-- ============================================================
CREATE TABLE stock (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL,
    location_id BIGINT,
    batch_id BIGINT,
    qty INT DEFAULT 0,
    locked_qty INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_stock UNIQUE (product_id, warehouse_id, location_id, batch_id)
);

-- ============================================================
-- 18. 物料批次表
-- ============================================================
CREATE TABLE material_batch (
    id BIGSERIAL PRIMARY KEY,
    batch_no VARCHAR(50) NOT NULL UNIQUE,
    product_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL,
    supplier_id BIGINT REFERENCES supplier(id),
    production_date DATE,
    expiry_date DATE,
    initial_qty INT,
    remaining_qty INT DEFAULT 0,
    status VARCHAR(64) DEFAULT 'NORMAL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 18.1 库存流水表
-- ============================================================
CREATE TABLE stock_move (
    id BIGSERIAL PRIMARY KEY,
    move_no VARCHAR(50) NOT NULL UNIQUE,
    product_id BIGINT NOT NULL,
    warehouse_id BIGINT NOT NULL,
    location_id BIGINT,
    batch_id BIGINT,
    to_warehouse_id BIGINT,
    to_location_id BIGINT,
    to_batch_id BIGINT,
    move_type VARCHAR(64) NOT NULL,
    move_reason VARCHAR(64) NOT NULL,
    qty INT NOT NULL,
    sale_order_item_id BIGINT,
    delivery_order_id BIGINT,
    delivery_order_item_id BIGINT,
    related_order_id BIGINT,
    related_order_type VARCHAR(64),
    unit_cost DECIMAL(12,4),
    amount DECIMAL(14,2),
    operator_id BIGINT,
    operate_time TIMESTAMP NOT NULL,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 18.2 调拨单主表
-- ============================================================
CREATE TABLE stock_transfer (
    id BIGSERIAL PRIMARY KEY,
    transfer_no VARCHAR(50) NOT NULL UNIQUE,
    from_warehouse_id BIGINT NOT NULL,
    to_warehouse_id BIGINT NOT NULL,
    status VARCHAR(64) DEFAULT 'DRAFT',
    operator_id BIGINT,
    receive_time TIMESTAMP,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 19. 调拨单明细表
-- ============================================================
CREATE TABLE stock_transfer_item (
    id BIGSERIAL PRIMARY KEY,
    transfer_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    from_location_id BIGINT,
    to_location_id BIGINT,
    from_batch_id BIGINT,
    qty INT NOT NULL,
    received_qty INT DEFAULT 0,
    remark VARCHAR(500)
);

-- ============================================================
-- 20. 盘点单主表
-- ============================================================
CREATE TABLE stock_inventory (
    id BIGSERIAL PRIMARY KEY,
    inventory_no VARCHAR(50) NOT NULL UNIQUE,
    warehouse_id BIGINT NOT NULL,
    inventory_type VARCHAR(64) NOT NULL,
    status VARCHAR(64) DEFAULT 'DRAFT',
    freeze_stock SMALLINT DEFAULT 0,
    operator_id BIGINT,
    approver_id BIGINT,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 21. 盘点单明细表
-- ============================================================
CREATE TABLE stock_inventory_item (
    id BIGSERIAL PRIMARY KEY,
    inventory_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    location_id BIGINT,
    batch_id BIGINT,
    book_qty INT DEFAULT 0,
    actual_qty INT DEFAULT 0,
    diff_qty INT DEFAULT 0,
    diff_amount DECIMAL(12,2),
    reason VARCHAR(200)
);

-- ============================================================
-- 22. 计件单价表
-- ============================================================
CREATE TABLE piece_price (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL,
    process_name VARCHAR(50) DEFAULT '注塑',
    price DECIMAL(10,4) NOT NULL,
    effective_date DATE NOT NULL,
    expire_date DATE,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_piece_price_product FOREIGN KEY (product_id) REFERENCES product(id),
    CONSTRAINT ck_piece_price_positive CHECK (price > 0),
    CONSTRAINT ck_piece_price_date_range CHECK (expire_date IS NULL OR expire_date >= effective_date)
);
CREATE INDEX idx_piece_price_product_process_date ON piece_price (product_id, process_name, effective_date DESC);

-- ============================================================
-- 23. 日工资表
-- ============================================================
CREATE TABLE salary_daily (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    work_date DATE NOT NULL,
    total_qualified_qty INT DEFAULT 0,
    total_piece_amount DECIMAL(10,4) DEFAULT 0,
    subsidy DECIMAL(10,4) DEFAULT 0,
    deduction DECIMAL(10,4) DEFAULT 0,
    total_amount DECIMAL(10,4) DEFAULT 0,
    status VARCHAR(64) DEFAULT 'DRAFT',
    confirmed_by BIGINT,
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_date UNIQUE (user_id, work_date),
    CONSTRAINT ck_salary_daily_status CHECK (status IN ('DRAFT', 'SETTLED'))
);

-- ============================================================
-- 24. 工资调整表
-- ============================================================
CREATE TABLE salary_adjust (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    adjust_type VARCHAR(64) NOT NULL,
    amount DECIMAL(10,4) NOT NULL,
    adjust_date DATE NOT NULL,
    reason VARCHAR(500),
    status VARCHAR(64) DEFAULT 'DRAFT',
    confirmed_by BIGINT,
    confirmed_at TIMESTAMP,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_salary_adjust_type CHECK (adjust_type IN ('BONUS', 'PENALTY')),
    CONSTRAINT ck_salary_adjust_amount CHECK (amount > 0),
    CONSTRAINT ck_salary_adjust_status CHECK (status IN ('DRAFT', 'SETTLED'))
);

CREATE INDEX idx_salary_daily_work_date_user ON salary_daily (work_date, user_id);
CREATE INDEX idx_salary_adjust_date_user ON salary_adjust (adjust_date, user_id);

-- ============================================================
-- 25. 回款记录表
-- ============================================================
CREATE TABLE payment_record (
    id BIGSERIAL PRIMARY KEY,
    payment_no VARCHAR(50) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL REFERENCES customer(id),
    sale_order_id BIGINT NOT NULL REFERENCES sale_order(id),
    pay_amount DECIMAL(12,2) NOT NULL CHECK (pay_amount > 0),
    pay_date DATE NOT NULL,
    pay_method VARCHAR(64) NOT NULL,
    invoice_no VARCHAR(50),
    remark TEXT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_record_sale_order ON payment_record (sale_order_id, pay_date DESC);
CREATE INDEX idx_payment_record_customer_date ON payment_record (customer_id, pay_date DESC);

CREATE OR REPLACE FUNCTION erp_recalculate_sale_order_received(target_sale_order_id BIGINT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    next_received NUMERIC(12,2);
    order_total NUMERIC(12,2);
BEGIN
    SELECT total_amount
      INTO order_total
      FROM sale_order
     WHERE id = target_sale_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '未找到销售订单';
    END IF;

    SELECT COALESCE(so.received_opening_amount, 0) + COALESCE(SUM(pr.pay_amount), 0)
      INTO next_received
      FROM sale_order so
      LEFT JOIN payment_record pr ON pr.sale_order_id = so.id
     WHERE so.id = target_sale_order_id
     GROUP BY so.id, so.received_opening_amount;

    IF next_received < 0 THEN
        RAISE EXCEPTION '销售订单已回款金额不能小于 0';
    END IF;

    IF order_total IS NOT NULL AND next_received > order_total THEN
        RAISE EXCEPTION '回款金额不能超过订单金额';
    END IF;

    UPDATE sale_order
       SET received_amount = next_received,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = target_sale_order_id;

    RETURN next_received;
END;
$$;

CREATE OR REPLACE FUNCTION erp_payment_record_sync_sale_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_status TEXT;
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.pay_amount <= 0 THEN
            RAISE EXCEPTION '回款金额必须大于 0';
        END IF;

        SELECT status
          INTO target_status
          FROM sale_order
         WHERE id = NEW.sale_order_id
         FOR UPDATE;

        IF target_status IS NULL THEN
            RAISE EXCEPTION '未找到销售订单';
        END IF;

        IF UPPER(COALESCE(target_status, '')) NOT IN ('APPROVED', 'CONFIRMED', 'PARTIAL', 'SHIPPED') THEN
            RAISE EXCEPTION '销售订单状态不允许回款';
        END IF;

        PERFORM erp_recalculate_sale_order_received(NEW.sale_order_id);
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.sale_order_id IS DISTINCT FROM NEW.sale_order_id THEN
        PERFORM erp_recalculate_sale_order_received(OLD.sale_order_id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM erp_recalculate_sale_order_received(OLD.sale_order_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_record_sync_sale_order
AFTER INSERT OR UPDATE OR DELETE ON payment_record
FOR EACH ROW EXECUTE FUNCTION erp_payment_record_sync_sale_order();

-- ============================================================
-- 26. 发货单表
-- ============================================================
CREATE TABLE delivery_order (
    id BIGSERIAL PRIMARY KEY,
    delivery_no VARCHAR(50) NOT NULL UNIQUE,
    sale_order_id BIGINT NOT NULL REFERENCES sale_order(id),
    customer_id BIGINT NOT NULL REFERENCES customer(id),
    delivery_date DATE NOT NULL,
    total_qty INT,
    logistics_company VARCHAR(100),
    tracking_no VARCHAR(100),
    status VARCHAR(64) DEFAULT 'PENDING',
    operator_id BIGINT,
    remark TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_delivery_status CHECK (status IN ('PENDING', 'SHIPPED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT ck_delivery_total_qty CHECK (COALESCE(total_qty, 0) >= 0)
);

-- ============================================================
-- 27. 发货单明细表
-- ============================================================
CREATE TABLE delivery_order_item (
    id BIGSERIAL PRIMARY KEY,
    delivery_order_id BIGINT NOT NULL REFERENCES delivery_order(id),
    sale_order_item_id BIGINT NOT NULL REFERENCES sale_order_item(id),
    product_id BIGINT NOT NULL REFERENCES product(id),
    qty INT NOT NULL CHECK (qty > 0),
    stock_move_id BIGINT REFERENCES stock_move(id)
);

CREATE INDEX idx_delivery_order_sale_order ON delivery_order (sale_order_id, delivery_date DESC);
CREATE INDEX idx_delivery_order_customer_date ON delivery_order (customer_id, delivery_date DESC);
CREATE INDEX idx_delivery_item_order ON delivery_order_item (delivery_order_id);
CREATE INDEX idx_delivery_item_stock_move ON delivery_order_item (stock_move_id);

-- ============================================================
-- 28. 费用支出表
-- ============================================================
CREATE TABLE expense_record (
    id BIGSERIAL PRIMARY KEY,
    expense_no VARCHAR(50) NOT NULL UNIQUE,
    expense_type VARCHAR(64) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL,
    payee VARCHAR(100) NOT NULL,
    remark TEXT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_expense_type CHECK (expense_type IN ('RENT', 'ELECTRICITY', 'WATER', 'MATERIAL', 'MAINTENANCE', 'SALARY', 'OTHER')),
    CONSTRAINT ck_expense_amount_positive CHECK (amount > 0),
    CONSTRAINT ck_expense_payee_required CHECK (BTRIM(payee) <> '')
);

CREATE INDEX idx_expense_record_date ON expense_record (expense_date DESC);
CREATE INDEX idx_expense_record_type_date ON expense_record (expense_type, expense_date DESC);
CREATE INDEX idx_expense_record_search_trgm ON expense_record USING GIN ((COALESCE(expense_no, '') || ' ' || COALESCE(payee, '') || ' ' || COALESCE(remark, '')) gin_trgm_ops);

-- ============================================================
-- 29. 操作日志表
-- ============================================================
CREATE TABLE sys_operation_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    username VARCHAR(50),
    module VARCHAR(50),
    action VARCHAR(50),
    target_type VARCHAR(50),
    target_id BIGINT,
    old_value TEXT,
    new_value TEXT,
    ip VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 30. 系统配置表
-- ============================================================
CREATE TABLE sys_config (
    id BIGSERIAL PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    config_desc VARCHAR(500),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 31. 通知消息表
-- ============================================================
CREATE TABLE notification (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(64) NOT NULL DEFAULT 'INFO',
    is_read SMALLINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 32. 单据序号表（并发安全的单据号分配）
-- ============================================================
CREATE TABLE seq_number (
    id BIGSERIAL PRIMARY KEY,
    seq_type VARCHAR(20) NOT NULL,
    seq_date DATE NOT NULL,
    current_seq INT NOT NULL DEFAULT 0,
    CONSTRAINT uk_type_date UNIQUE (seq_type, seq_date)
);

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
-- 5. 插入系统配置项（默认配置）
-- -----------------------------------------------------------
INSERT INTO sys_config (config_key, config_value, config_desc) VALUES
('system_title', '注塑厂管理系统', '系统标题'),
('factory_name', 'XX注塑厂', '工厂名称，显示在系统标题'),
('shift_day_start', '08:00', '白班开始时间'),
('shift_night_start', '20:00', '夜班开始时间'),
('overtime_threshold_min', '480', '日工时超过此值计加班（分钟）'),
('bad_rate_warning', '5', '不良率预警阈值（%）'),
('delivery_warning_days', '3', '交期预警天数'),
('stock_expiry_warning_days', '30', '批次临期预警天数'),
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
('mold_maintenance_warning_ratio', '0.8', '模具保养预警比例（达到保养周期百分比时预警）'),
('mold_lifetime_warning_ratio', '0.9', '模具寿命预警比例（达到寿命百分比时预警）'),
('external_push_enabled', 'false', '是否启用外部消息推送'),
('wecom_webhook_url', '', '企业微信 Webhook'),
('dingtalk_webhook_url', '', '钉钉 Webhook');
