-- ============================================================
-- 注塑厂综合管理系统（ERP + MES）数据库初始化脚本
-- 数据库：PostgreSQL 15+ / Supabase PostgreSQL
-- 编码：UTF-8（无 BOM）
-- 重建日期：2026-07-12
-- 说明：面向全新数据库的基础 ERP、注塑专业与工作流架构
-- 提示：全新 Supabase 项目只执行 database/supabase-cloud.sql，本文件用于基础架构审查。
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, extensions, public;

-- ============================================================
-- 1. 系统用户表
-- ============================================================
CREATE TABLE sys_user (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    real_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    auth_user_id UUID UNIQUE,
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
    disposal_status VARCHAR(32) DEFAULT 'OPEN',
    disposal_assignee VARCHAR(100),
    disposal_close_reason TEXT,
    disposal_updated_at TIMESTAMP,
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

-- ============================================================
-- Injection professional extension tables
-- ============================================================
CREATE TABLE IF NOT EXISTS process_card (
    id BIGSERIAL PRIMARY KEY,
    card_no VARCHAR(50) NOT NULL UNIQUE,
    product_id BIGINT NOT NULL,
    mold_id BIGINT,
    machine_id BIGINT,
    material_id BIGINT,
    version_no INT NOT NULL DEFAULT 1,
    material_temp DECIMAL(10,2),
    mold_temp DECIMAL(10,2),
    injection_pressure DECIMAL(10,2),
    holding_pressure DECIMAL(10,2),
    cooling_seconds INT,
    cycle_seconds INT,
    clamping_force DECIMAL(10,2),
    back_pressure DECIMAL(10,2),
    change_reason TEXT,
    status VARCHAR(64) DEFAULT 'DRAFT',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trial_mold_record (
    id BIGSERIAL PRIMARY KEY,
    trial_no VARCHAR(50) NOT NULL UNIQUE,
    prod_order_id BIGINT NOT NULL,
    process_card_id BIGINT NOT NULL,
    project_id BIGINT,
    mold_id BIGINT,
    machine_id BIGINT,
    trial_stage VARCHAR(32),
    shot_count INT DEFAULT 0,
    cycle_seconds DECIMAL(12,2),
    first_article_result VARCHAR(100),
    defect_summary TEXT,
    correction_action TEXT,
    production_ready BOOLEAN DEFAULT FALSE,
    image_urls JSONB DEFAULT '[]'::jsonb,
    remark TEXT,
    status VARCHAR(64) DEFAULT 'WAIT_TRIAL',
    created_by BIGINT,
    confirmed_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_mix_order (
    id BIGSERIAL PRIMARY KEY,
    mix_no VARCHAR(50) NOT NULL UNIQUE,
    prod_order_id BIGINT NOT NULL,
    product_id BIGINT,
    material_batch_id BIGINT NOT NULL,
    material_qty DECIMAL(12,3) NOT NULL,
    regrind_ratio DECIMAL(6,2) DEFAULT 0,
    drying_temp DECIMAL(10,2),
    drying_minutes INT,
    remark TEXT,
    status VARCHAR(64) DEFAULT 'DRAFT',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_material_mix_regrind CHECK (regrind_ratio >= 0 AND regrind_ratio <= 100)
);

CREATE TABLE IF NOT EXISTS batch_trace_link (
    id BIGSERIAL PRIMARY KEY,
    trace_no VARCHAR(80) NOT NULL UNIQUE,
    source_type VARCHAR(64) NOT NULL,
    source_id BIGINT NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id BIGINT NOT NULL,
    batch_id BIGINT,
    prod_order_id BIGINT,
    sale_order_id BIGINT,
    remark TEXT,
    status VARCHAR(64) DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS startup_check (
    id BIGSERIAL PRIMARY KEY,
    check_no VARCHAR(50) NOT NULL UNIQUE,
    prod_order_id BIGINT NOT NULL,
    process_card_id BIGINT,
    material_ready BOOLEAN DEFAULT false,
    mold_ready BOOLEAN DEFAULT false,
    machine_ready BOOLEAN DEFAULT false,
    first_article_ok BOOLEAN DEFAULT false,
    staff_ready BOOLEAN DEFAULT false,
    failed_items JSONB DEFAULT '[]'::jsonb,
    failed_items_text TEXT,
    remark TEXT,
    status VARCHAR(64) DEFAULT 'PENDING',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_order (
    id BIGSERIAL PRIMARY KEY,
    order_no VARCHAR(50) NOT NULL UNIQUE,
    machine_id BIGINT NOT NULL,
    fault_type VARCHAR(100) NOT NULL,
    priority VARCHAR(64) DEFAULT 'INFO',
    assignee_id BIGINT,
    spare_part_cost DECIMAL(12,2) DEFAULT 0,
    remark TEXT,
    status VARCHAR(64) DEFAULT 'REPORTED',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spare_part (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE,
    name VARCHAR(100) NOT NULL,
    spec VARCHAR(200),
    qty DECIMAL(12,3) DEFAULT 0,
    safe_stock DECIMAL(12,3) DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'pcs',
    remark TEXT,
    status VARCHAR(64) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mold_maintenance_plan (
    id BIGSERIAL PRIMARY KEY,
    plan_no VARCHAR(50) NOT NULL UNIQUE,
    mold_id BIGINT NOT NULL,
    mold_code VARCHAR(80),
    maintenance_cycle INT NOT NULL,
    shots_since_maintenance INT DEFAULT 0,
    lifetime INT DEFAULT 0,
    used_shots INT DEFAULT 0,
    abnormal_count INT DEFAULT 0,
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    maintenance_rate DECIMAL(8,2) DEFAULT 0,
    life_rate DECIMAL(8,2) DEFAULT 0,
    risk_level VARCHAR(64) DEFAULT 'normal',
    remark TEXT,
    status VARCHAR(64) DEFAULT 'NORMAL',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS andon_event (
    id BIGSERIAL PRIMARY KEY,
    event_no VARCHAR(50) NOT NULL UNIQUE,
    source_type VARCHAR(64) NOT NULL,
    source_id BIGINT,
    level VARCHAR(64) DEFAULT 'INFO',
    title VARCHAR(200) NOT NULL,
    description TEXT,
    assignee_id BIGINT,
    closed_reason TEXT,
    status VARCHAR(64) DEFAULT 'OPEN',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS label_template (
    id BIGSERIAL PRIMARY KEY,
    template_no VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    template_content TEXT,
    version_no INT DEFAULT 1,
    status VARCHAR(64) DEFAULT 'ACTIVE',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_complaint (
    id BIGSERIAL PRIMARY KEY,
    complaint_no VARCHAR(50) NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL,
    product_id BIGINT,
    batch_id BIGINT,
    severity VARCHAR(64) DEFAULT 'INFO',
    defect_desc TEXT,
    corrective_action TEXT,
    preventive_action TEXT,
    d1_team TEXT,
    d2_problem TEXT,
    d3_containment TEXT,
    d4_root_cause TEXT,
    d5_corrective_action TEXT,
    d6_implementation TEXT,
    d7_prevention TEXT,
    d8_closure TEXT,
    status VARCHAR(64) DEFAULT 'REGISTERED',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oee_record (
    id BIGSERIAL PRIMARY KEY,
    record_no VARCHAR(50) UNIQUE,
    record_date DATE NOT NULL,
    shift VARCHAR(64) NOT NULL,
    machine_id BIGINT NOT NULL,
    planned_minutes INT NOT NULL,
    running_minutes INT NOT NULL,
    ideal_cycle_seconds DECIMAL(10,2),
    actual_qty INT DEFAULT 0,
    good_qty INT DEFAULT 0,
    downtime_minutes INT DEFAULT 0,
    changeover_minutes INT DEFAULT 0,
    availability DECIMAL(8,2) DEFAULT 0,
    performance DECIMAL(8,2) DEFAULT 0,
    quality_rate DECIMAL(8,2) DEFAULT 0,
    oee DECIMAL(8,2) DEFAULT 0,
    status VARCHAR(64) DEFAULT 'DRAFT',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS process_change (
    id BIGSERIAL PRIMARY KEY,
    change_no VARCHAR(50) NOT NULL UNIQUE,
    change_type VARCHAR(64) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id BIGINT NOT NULL,
    old_version VARCHAR(50),
    new_version VARCHAR(50),
    reason TEXT,
    effective_at TIMESTAMP,
    status VARCHAR(64) DEFAULT 'DRAFT',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_requisition (
    id BIGSERIAL PRIMARY KEY,
    requisition_no VARCHAR(50) NOT NULL UNIQUE,
    material_id BIGINT NOT NULL,
    shortage_qty DECIMAL(12,3) DEFAULT 0,
    requested_qty DECIMAL(12,3) NOT NULL,
    supplier_id BIGINT,
    expected_date DATE,
    source_mrp_no VARCHAR(80),
    remark TEXT,
    status VARCHAR(64) DEFAULT 'DRAFT',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_process_card_product_status ON process_card (product_id, status);
CREATE INDEX IF NOT EXISTS idx_trial_mold_order_status ON trial_mold_record (prod_order_id, status);
CREATE INDEX IF NOT EXISTS idx_material_mix_order_batch ON material_mix_order (prod_order_id, material_batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_trace_lookup ON batch_trace_link (batch_id, prod_order_id, sale_order_id);
CREATE INDEX IF NOT EXISTS idx_startup_check_order_status ON startup_check (prod_order_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_machine_status ON maintenance_order (machine_id, status);
CREATE INDEX IF NOT EXISTS idx_mold_maintenance_plan_status ON mold_maintenance_plan (mold_id, status, risk_level);
CREATE INDEX IF NOT EXISTS idx_andon_status_level ON andon_event (status, level);
CREATE INDEX IF NOT EXISTS idx_complaint_customer_status ON customer_complaint (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_oee_machine_date ON oee_record (machine_id, record_date);
CREATE INDEX IF NOT EXISTS idx_process_change_target ON process_change (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_material_status ON purchase_requisition (material_id, status);

-- Unified workflow center for approvals, task handoff and todo integration.
CREATE TABLE IF NOT EXISTS workflow_definition (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    business_type VARCHAR(80) NOT NULL UNIQUE,
    enabled BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_instance (
    id BIGSERIAL PRIMARY KEY,
    definition_code VARCHAR(80) NOT NULL,
    business_type VARCHAR(80) NOT NULL,
    business_id BIGINT NOT NULL,
    business_code VARCHAR(120),
    title VARCHAR(240) NOT NULL,
    status VARCHAR(64) DEFAULT 'DRAFT',
    current_node VARCHAR(80),
    route VARCHAR(200),
    owner_id BIGINT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    CONSTRAINT uq_workflow_instance_business UNIQUE (business_type, business_id)
);

CREATE TABLE IF NOT EXISTS workflow_task (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT NOT NULL REFERENCES workflow_instance(id) ON DELETE CASCADE,
    task_no VARCHAR(120) NOT NULL UNIQUE,
    business_type VARCHAR(80) NOT NULL,
    business_id BIGINT NOT NULL,
    business_code VARCHAR(120),
    title VARCHAR(240) NOT NULL,
    description TEXT,
    status VARCHAR(64) DEFAULT 'OPEN',
    node VARCHAR(80),
    priority INT DEFAULT 60,
    assignee_id BIGINT,
    assignee_name VARCHAR(120),
    source_route VARCHAR(200),
    due_at TIMESTAMP,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    claimed_at TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_log (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT REFERENCES workflow_instance(id) ON DELETE CASCADE,
    task_id BIGINT REFERENCES workflow_task(id) ON DELETE SET NULL,
    business_type VARCHAR(80) NOT NULL,
    business_id BIGINT NOT NULL,
    action VARCHAR(64) NOT NULL,
    from_status VARCHAR(64),
    to_status VARCHAR(64),
    actor_id BIGINT,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO workflow_definition (code, name, business_type, config)
VALUES
    ('customer-master-review', '客户资料审核', 'customer', '{"route":"/base/customers"}'::jsonb),
    ('sale-order-approval', '销售订单审核', 'sale_order', '{"route":"/sale/orders"}'::jsonb),
    ('purchase-requisition-approval', '采购请购审批', 'purchase_requisition', '{"route":"/injection/purchase-requisition"}'::jsonb),
    ('production-order-flow', '生产工单闭环', 'prod_order', '{"route":"/prod/orders"}'::jsonb),
    ('maintenance-order-repair-flow', '设备维修闭环', 'maintenance_order', '{"route":"/injection/maintenance-order"}'::jsonb),
    ('spare-part-replenishment', '备件补货闭环', 'spare_part', '{"route":"/equipment/spare-parts"}'::jsonb),
    ('salary-month-review', '工资月结复核', 'salary_month', '{"route":"/salary/monthly"}'::jsonb),
    ('qc-defect-disposal-flow', '不良品处置闭环', 'qc_record', '{"route":"/qc/defect-disposal"}'::jsonb),
    ('stock-inventory-approval', '库存盘点审批', 'stock_inventory', '{"route":"/stock/inventory"}'::jsonb),
    ('expense-approval-flow', '费用支出审批', 'expense_record', '{"route":"/finance/expenses"}'::jsonb),
    ('payment-confirmation-flow', '销售回款确认', 'payment_record', '{"route":"/sale/payments"}'::jsonb),
    ('purchase-inbound-review', '采购入库复核', 'purchase_inbound', '{"route":"/stock/in-purchase"}'::jsonb)
ON CONFLICT (business_type) DO UPDATE
SET code = EXCLUDED.code,
    name = EXCLUDED.name,
    config = EXCLUDED.config,
    enabled = TRUE,
    updated_at = CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_workflow_instance_status ON workflow_instance (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_instance_business ON workflow_instance (business_type, business_id);
CREATE INDEX IF NOT EXISTS idx_workflow_task_status_priority ON workflow_task (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_task_assignee ON workflow_task (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_task_business ON workflow_task (business_type, business_id);
CREATE INDEX IF NOT EXISTS idx_workflow_log_business ON workflow_log (business_type, business_id, created_at DESC);

COMMIT;
