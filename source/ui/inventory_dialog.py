"""Two-step, read-only MES inventory and batch reserve lookup."""
from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLineEdit,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from services.inventory_service import InventoryPage, InventoryService, ReservePage
from services.mes_credentials import MesCredentialError, MesCredentialStore

from .combo_delegate import configure_combo_popup
from .dialogs import BaseDialog, button, label
from .theme_tokens import form_font
from .workers import TaskManager


class InventoryDialog(BaseDialog):
    """One in-memory session, with optional encrypted local login storage."""

    HEADERS = ("物料编码", "物料名称", "批号/SN", "数量", "可分配量", "单位", "备货客户码", "库房", "库位", "库存日期", "更新日期")
    RESERVE_HEADERS = ("牌号", "批号", "数量", "客户码", "入库时间", "客户交期", "客户名称", "质量状态",
                       "质量描述", "业务员", "业务员代码", "客户标识", "库房")

    def __init__(self, grade="", parent=None, *, service=None, data_folder=None, credential_store=None):
        super().__init__("库存查询 · MES", 1180, 740, parent)
        self.setFont(form_font())
        self.body.setFont(form_font())
        self.service = service or InventoryService()
        self.credential_store = credential_store if credential_store is not None else (
            MesCredentialStore(data_folder) if data_folder is not None else None)
        self.tasks = TaskManager(SimpleNamespace(data_generation=0, storage_generation="mes"), self)
        self.tasks.read_pool.setMaxThreadCount(1)
        self.tasks.busyChanged.connect(self._set_pending)
        self.tasks.drained.connect(self._tasks_finished)
        self.pending = False
        self.page = self.pages = self.reserve_page = self.reserve_pages = 1
        self._closed_service = self._closing = self._resume_parent_close = False
        self._close_result = QDialog.DialogCode.Rejected
        self.result: InventoryPage | None = None
        self.reserve_result: ReservePage | None = None

        self.content.insertWidget(0, label("MES 库存查询", "title"))
        intro = label("先用简短的物料编码或名称查询，选中一行后查看该批号的备货库存。", "muted")
        intro.setWordWrap(True)
        self.content.insertWidget(1, intro)

        login = QFrame()
        login.setProperty("role", "panel")
        login_layout = QFormLayout(login)
        login_layout.setContentsMargins(16, 14, 16, 14)
        login_layout.setHorizontalSpacing(14)
        self.username = QLineEdit()
        self.username.setMaxLength(120)
        self.username.setPlaceholderText("MES 账号")
        self.username.setAccessibleName("MES账号")
        self.username.setClearButtonEnabled(True)
        self.password = QLineEdit()
        self.password.setMaxLength(256)
        self.password.setPlaceholderText("MES 密码")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.password.setAccessibleName("MES密码")
        self.password.returnPressed.connect(self.login)
        self.login_button = button("登录 MES", self.login, True)
        self.login_button.setAccessibleName("登录MES")
        self.remember_login = QCheckBox("记住账号和密码（本机加密）")
        self.remember_login.setAccessibleName("记住MES账号和密码")
        self.remember_login.setChecked(self.credential_store is not None)
        self.remember_login.toggled.connect(self._remember_changed)
        login_layout.addRow("账号", self.username)
        login_layout.addRow("密码", self.password)
        login_layout.addRow("", self.remember_login)
        login_layout.addRow("", self.login_button)
        self.content.addWidget(login)
        self.login_panel = login

        self.tabs = QTabWidget()
        self.tabs.setAccessibleName("库存查询步骤")
        inventory_tab = QWidget()
        stock_layout = QVBoxLayout(inventory_tab)
        stock_layout.setContentsMargins(12, 12, 12, 12)
        stock_layout.setSpacing(12)
        self.tabs.addTab(inventory_tab, "1. 库存综合查询")
        self.query_panel = QFrame()
        self.query_panel.setProperty("role", "panel")
        query_layout = QHBoxLayout(self.query_panel)
        query_layout.setContentsMargins(12, 12, 12, 12)
        query_layout.setSpacing(10)
        self.search_by = QComboBox()
        self.search_by.addItem("物料编码 / 牌号", "material_code")
        self.search_by.addItem("物料名称", "material_name")
        self.search_by.setAccessibleName("库存查询字段")
        configure_combo_popup(self.search_by)
        self.grade = QLineEdit(grade or "")
        self.grade.setPlaceholderText("输入简短关键字，例如 AG6（自动包含匹配）")
        self.grade.setAccessibleName("库存查询物料关键字")
        self.grade.setClearButtonEnabled(True)
        self.grade.setMinimumWidth(200)
        self.grade.setMaxLength(120)
        self.grade.returnPressed.connect(self.query)
        self.query_button = button("查询库存", self.query, True, "search")
        query_layout.addWidget(self.search_by)
        query_layout.addWidget(self.grade, 1)
        query_layout.addWidget(self.query_button)
        stock_layout.addWidget(self.query_panel)
        self.status = label("尚未登录 MES", "muted")
        self.status.setWordWrap(True)
        stock_layout.addWidget(self.status)
        self.table = self._make_table(self.HEADERS, (160, 150, 140, 90, 100, 70, 115, 120, 100, 185, 185))
        self.table.setAccessibleName("库存综合查询结果")
        self.table.itemSelectionChanged.connect(self._set_batch_actions)
        self.table.cellDoubleClicked.connect(lambda *_: self.show_reserve())
        stock_layout.addWidget(self.table, 1)
        actions = QHBoxLayout()
        self.batch_status = label("选中库存行后，可复制批号或查看备货。", "muted")
        self.batch_status.setWordWrap(True)
        self.copy_batch_button = button("复制批号", self.copy_batch)
        self.reserve_selected_button = button("查看该批号备货", self.show_reserve, True)
        actions.addWidget(self.batch_status, 1)
        actions.addWidget(self.copy_batch_button)
        actions.addWidget(self.reserve_selected_button)
        stock_layout.addLayout(actions)
        self.page_status = label("0 条", "muted")
        self.previous_button = button("上一页", self.previous_page)
        self.next_button = button("下一页", self.next_page)
        stock_layout.addLayout(self._pager(self.page_status, self.previous_button, self.next_button))
        self.quantity_status = label("", "muted")
        self.quantity_status.setWordWrap(True)
        stock_layout.addWidget(self.quantity_status)

        reserve_tab = QWidget()
        reserve_layout = QVBoxLayout(reserve_tab)
        reserve_layout.setContentsMargins(12, 12, 12, 12)
        reserve_layout.setSpacing(12)
        self.tabs.addTab(reserve_tab, "2. 备货库存查询")
        self.reserve_query_panel = QFrame()
        self.reserve_query_panel.setProperty("role", "panel")
        reserve_query_layout = QHBoxLayout(self.reserve_query_panel)
        reserve_query_layout.setContentsMargins(12, 12, 12, 12)
        reserve_query_layout.setSpacing(10)
        reserve_query_layout.addWidget(label("批号", "heading"))
        self.batch = QLineEdit()
        self.batch.setMaxLength(120)
        self.batch.setClearButtonEnabled(True)
        self.batch.setPlaceholderText("从库存行带入批号，或粘贴完整批号后查询")
        self.batch.setAccessibleName("备货库存批号")
        self.batch.returnPressed.connect(self.query_reserve)
        self.reserve_query_button = button("查询备货", self.query_reserve, True, "search")
        self.back_button = button("返回物料查询", lambda: self.tabs.setCurrentIndex(0))
        reserve_query_layout.addWidget(self.batch, 1)
        reserve_query_layout.addWidget(self.reserve_query_button)
        reserve_query_layout.addWidget(self.back_button)
        reserve_layout.addWidget(self.reserve_query_panel)
        self.reserve_status = label("请先查询物料并选择批号，也可在这里粘贴批号。", "muted")
        self.reserve_status.setWordWrap(True)
        reserve_layout.addWidget(self.reserve_status)
        self.reserve_table = self._make_table(
            self.RESERVE_HEADERS, (160, 130, 80, 100, 185, 115, 220, 100, 160, 100, 120, 160, 120))
        self.reserve_table.setAccessibleName("备货库存查询结果")
        reserve_layout.addWidget(self.reserve_table, 1)
        self.reserve_page_status = label("0 条", "muted")
        self.reserve_previous_button = button("上一页", self.reserve_previous_page)
        self.reserve_next_button = button("下一页", self.reserve_next_page)
        reserve_layout.addLayout(self._pager(self.reserve_page_status, self.reserve_previous_button, self.reserve_next_button))
        self.reserve_quantity_status = label("", "muted")
        self.reserve_quantity_status.setWordWrap(True)
        reserve_layout.addWidget(self.reserve_quantity_status)
        self.content.addWidget(self.tabs, 1)
        self.logout_button = button("退出 MES", self.logout)
        self.clear_login_button = button("清除已保存登录", self.clear_saved_login)
        self.clear_login_button.setToolTip("清除本机保存的账号密码；当前登录会话仍可继续查询")
        self.footer.addWidget(self.clear_login_button)
        self.footer.addWidget(self.logout_button)
        self.footer.addWidget(button("关闭", self.reject))
        self.grade.textChanged.connect(self._grade_changed)
        self.search_by.currentIndexChanged.connect(self._grade_changed)
        self.batch.textChanged.connect(self._batch_changed)
        self.query_panel.setEnabled(False)
        self.reserve_query_panel.setEnabled(False)
        self._set_pending(False)
        self._restore_saved_login()
        (self.login_button if self.password.text() else self.username).setFocus()

    @staticmethod
    def _make_table(headers, widths):
        table = QTableWidget(0, len(headers))
        table.setHorizontalHeaderLabels(headers)
        table.setFont(form_font())
        table.horizontalHeader().setFont(form_font())
        table.horizontalHeader().setDefaultAlignment(Qt.AlignmentFlag.AlignCenter)
        table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        table.setAlternatingRowColors(True)
        table.setWordWrap(False)
        table.setShowGrid(True)
        table.setGridStyle(Qt.PenStyle.SolidLine)
        table.setStyleSheet("QTableWidget::item { padding: 0 8px; }")
        table.verticalHeader().hide()
        table.verticalHeader().setDefaultSectionSize(36)
        table.setMinimumHeight(260)
        table.setHorizontalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        table.horizontalHeader().setStretchLastSection(False)
        table.setProperty("baseColumnWidths", list(widths))
        for column, width in enumerate(widths):
            table.setColumnWidth(column, width)
        return table

    @staticmethod
    def _pager(status, previous, following):
        status.setWordWrap(True)
        layout = QHBoxLayout()
        layout.addWidget(status, 1)
        layout.addWidget(previous)
        layout.addWidget(following)
        return layout

    def _set_pending(self, value):
        self.pending = value
        if self._closing:
            return
        logged_in = self.service.logged_in
        self.login_button.setEnabled(not value and not logged_in)
        self.query_button.setEnabled(not value and logged_in)
        self.reserve_query_button.setEnabled(not value and logged_in)
        self.logout_button.setEnabled(not value and logged_in)
        self.username.setReadOnly(value or logged_in)
        self.password.setReadOnly(value or logged_in)
        self.remember_login.setEnabled(not value and not logged_in and self.credential_store is not None)
        self.clear_login_button.setEnabled(not value and self.credential_store is not None)
        self.grade.setReadOnly(value)
        self.batch.setReadOnly(value)
        self.search_by.setEnabled(not value)
        self.tabs.tabBar().setEnabled(not value)
        self.back_button.setEnabled(not value)
        self._set_pager()
        self._set_batch_actions()

    def _clear_result(self):
        self.result = None
        self.page = self.pages = 1
        self.table.setRowCount(0)
        self.page_status.setText("0 条")
        self.quantity_status.setText("")
        self._set_pager()
        self._set_batch_actions()

    def _clear_reserve_result(self):
        self.reserve_result = None
        self.reserve_page = self.reserve_pages = 1
        self.reserve_table.setRowCount(0)
        self.reserve_page_status.setText("0 条")
        self.reserve_quantity_status.setText("")
        self._set_pager()

    def _grade_changed(self):
        self._clear_result()
        self.batch.clear()
        self._clear_reserve_result()
        if not self.pending and self.service.logged_in:
            self.status.setText("物料查询条件已变化，请点击查询库存")

    def _batch_changed(self):
        self._clear_reserve_result()
        if not self.pending and self.service.logged_in:
            self.reserve_status.setText("批号已变化，请点击查询备货")

    def login(self):
        if self.pending or self._closing or self.service.logged_in:
            return
        username, password = self.username.text(), self.password.text()
        self.password.clear()
        self.notice.hide()
        self.status.setText("正在登录 MES…")
        self._set_pending(True)
        remember = self.remember_login.isChecked()

        def authenticate():
            result = self.service.login(username, password)
            warning = ""
            if remember and self.credential_store is not None and self.service.logged_in:
                try:
                    self.credential_store.save(username, password)
                except MesCredentialError as exc:
                    warning = str(exc)
            return dict(result, credential_warning=warning)

        self.tasks.submit(authenticate, self._login_done, self._failed)

    def _login_done(self, result):
        if self._closing:
            return
        self.query_panel.setEnabled(True)
        self.reserve_query_panel.setEnabled(True)
        self.login_panel.hide()
        self.notice.hide()
        self.status.setText(result.get("message", "MES 已登录，可查询库存"))
        if result.get("credential_warning"):
            self.notice.show_message(result["credential_warning"], True)
        self.password.clear()
        (self.grade if self.tabs.currentIndex() == 0 else self.batch).setFocus()

    def _restore_saved_login(self):
        if self.credential_store is None or not self.remember_login.isChecked():
            return
        try:
            saved = self.credential_store.load()
            if saved:
                self.username.setText(saved[0])
                self.password.setText(saved[1])
        except MesCredentialError as exc:
            self.notice.show_message(str(exc), True)

    def _remember_changed(self, checked):
        if not checked:
            self.clear_saved_login(clear_fields=False)

    def clear_saved_login(self, *, clear_fields=True):
        if self.pending or self._closing or self.credential_store is None:
            return
        try:
            self.credential_store.clear()
        except MesCredentialError as exc:
            self.remember_login.blockSignals(True)
            self.remember_login.setChecked(True)
            self.remember_login.blockSignals(False)
            self.notice.show_message(str(exc), True)
            return
        self.remember_login.blockSignals(True)
        self.remember_login.setChecked(False)
        self.remember_login.blockSignals(False)
        if clear_fields and not self.service.logged_in:
            self.username.clear()
            self.password.clear()
        self.notice.show_message("已清除本机保存的 MES 登录信息。")

    def query(self):
        self._query(1)

    def _query(self, page):
        if self.pending or self._closing or not self.service.logged_in:
            return
        value = self.grade.text().strip()
        search_by = self.search_by.currentData()
        if not value:
            self._failed(ValueError("请输入简短的物料编码或物料名称"))
            return
        self._clear_result()
        self.notice.hide()
        self.status.setText(f"正在查询“{value}”的库存…")
        self._set_pending(True)
        self.tasks.submit(lambda: self.service.query(value, page, search_by=search_by), self._query_done, self._failed)

    @staticmethod
    def _fill_table(table, rows, keys):
        table.setRowCount(len(rows))
        for row_index, row in enumerate(rows):
            for column, key in enumerate(keys):
                value = str(row.get(key) or "")
                item = QTableWidgetItem(value)
                item.setToolTip(value + (f"\n库房名称：{row['warehouse_name']}" if key == "warehouse" and row.get("warehouse_name") else ""))
                item.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
                table.setItem(row_index, column, item)
        metrics = table.fontMetrics()
        for column, minimum in enumerate(table.property("baseColumnWidths")):
            widest = max((metrics.horizontalAdvance(str(row.get(keys[column]) or "")) for row in rows), default=0)
            table.setColumnWidth(column, max(minimum, min(640, widest + 32)))

    def _query_done(self, result):
        if self._closing:
            return
        if result.grade != self.grade.text().strip() or result.search_by != self.search_by.currentData():
            self.status.setText("物料查询条件已变化，请重新查询")
            return
        self.result = result
        self.notice.hide()
        self.page, self.pages = result.page, result.pages
        self._fill_table(self.table, result.items,
                         ("grade", "material", "batch", "stock", "available", "unit", "customer_code", "warehouse", "site", "stock_date", "updated_date"))
        self.page_status.setText(f"第 {self.page}/{self.pages} 页 · 本页 {len(result.items)} 条 / 共 {result.total} 条 · {result.queried_at}")
        self.status.setText(f"“{result.grade}”的库存查询完成，请选中批号查看备货" if result.items else
                            "本页已无记录，请重新查询" if result.total else f"未找到包含“{result.grade}”的库存")
        totals = {}
        for row in result.items:
            unit = row["unit"] or "未注明单位"
            values = totals.setdefault(unit, [Decimal(0), Decimal(0), False])
            values[0] += Decimal(row["stock"] or 0)
            values[1] += Decimal(row["available"] or 0)
            values[2] = values[2] or not row["stock"] or not row["available"]
        self.quantity_status.setText("；".join(
            f"本页库存 {stock:f} {unit} · 可分配 {available:f} {unit}" + ("（存在空数量，合计仅含已知值）" if missing else "")
            for unit, (stock, available, missing) in totals.items()))
        self._set_pager()
        self._set_batch_actions()

    def _selected_batch(self):
        row = self.table.currentRow()
        if self.result and self.table.selectionModel().hasSelection() and 0 <= row < len(self.result.items):
            return str(self.result.items[row].get("batch") or "").strip()
        return ""

    def _set_batch_actions(self):
        batch = self._selected_batch()
        enabled = bool(batch) and self.service.logged_in and not self.pending and not self._closing
        self.copy_batch_button.setEnabled(enabled)
        self.reserve_selected_button.setEnabled(enabled)
        self.batch_status.setText(f"已选批号：{batch}" if batch else "选中有批号的库存行后，可复制批号或查看备货。")

    def copy_batch(self):
        batch = self._selected_batch()
        if not batch or self.pending or self._closing or not self.service.logged_in:
            return
        QApplication.clipboard().setText(batch)
        self.batch.setText(batch)
        self.notice.show_message(f"批号 {batch} 已复制，也已填入备货查询。")

    def show_reserve(self):
        batch = self._selected_batch()
        if not batch or self.pending or self._closing or not self.service.logged_in:
            return
        self.batch.setText(batch)
        self.tabs.setCurrentIndex(1)
        self.query_reserve()

    def query_reserve(self):
        self._query_reserve(1)

    def _query_reserve(self, page):
        if self.pending or self._closing or not self.service.logged_in:
            return
        batch = self.batch.text().strip()
        if not batch:
            self._reserve_failed(ValueError("请输入完整批号，或返回库存综合查询选择一行"))
            return
        self._clear_reserve_result()
        self.notice.hide()
        self.reserve_status.setText(f"正在查询批号“{batch}”的备货库存…")
        self._set_pending(True)
        self.tasks.submit(lambda: self.service.query_reserve(batch, page), self._reserve_done, self._reserve_failed)

    def _reserve_done(self, result):
        if self._closing:
            return
        if result.batch != self.batch.text().strip():
            self.reserve_status.setText("批号已变化，请重新查询")
            return
        self.reserve_result = result
        self.notice.hide()
        self.reserve_page, self.reserve_pages = result.page, result.pages
        self._fill_table(self.reserve_table, result.items,
                         ("grade", "batch", "stock", "customer_code", "stock_date", "delivery_date", "customer", "quality",
                          "quality_description", "salesperson", "salesperson_code", "customer_tag", "warehouse"))
        self.reserve_page_status.setText(f"第 {result.page}/{result.pages} 页 · 本页 {len(result.items)} 条 / 共 {result.total} 条 · {result.queried_at}")
        self.reserve_status.setText(f"批号“{result.batch}”的备货查询完成（完整批号匹配）" if result.items else
                                    "本页已无记录，请重新查询" if result.total else f"批号“{result.batch}”没有备货记录")
        total = sum((Decimal(row["stock"] or 0) for row in result.items), Decimal(0))
        missing = any(not row["stock"] for row in result.items)
        self.reserve_quantity_status.setText(
            f"本页备货数量 {total:f} · MES 未提供单位" + ("（存在空数量，仅合计已知值）" if missing else "") if result.items else "")
        self._set_pager()

    def _failed(self, exc):
        if self._closing:
            return
        self._clear_result()
        self._clear_reserve_result()
        self._sync_login()
        self.notice.show_message(str(exc), True)
        self.status.setText(str(exc))

    def _reserve_failed(self, exc):
        if self._closing:
            return
        self._clear_reserve_result()
        if not self.service.logged_in:
            self._clear_result()
            self.status.setText(str(exc))
        self._sync_login()
        self.notice.show_message(str(exc), True)
        self.reserve_status.setText(str(exc))

    def _sync_login(self):
        self.query_panel.setEnabled(self.service.logged_in)
        self.reserve_query_panel.setEnabled(self.service.logged_in)
        self.login_panel.setVisible(not self.service.logged_in)

    def _set_pager(self):
        enabled = self.service.logged_in and not self.pending and not self._closing
        self.previous_button.setEnabled(enabled and self.result is not None and self.page > 1)
        self.next_button.setEnabled(enabled and self.result is not None and self.page < self.pages)
        self.reserve_previous_button.setEnabled(enabled and self.reserve_result is not None and self.reserve_page > 1)
        self.reserve_next_button.setEnabled(enabled and self.reserve_result is not None and self.reserve_page < self.reserve_pages)

    def previous_page(self):
        if self.page > 1 and not self.pending:
            self._query(self.page - 1)

    def next_page(self):
        if self.page < self.pages and not self.pending:
            self._query(self.page + 1)

    def reserve_previous_page(self):
        if self.reserve_page > 1 and not self.pending:
            self._query_reserve(self.reserve_page - 1)

    def reserve_next_page(self):
        if self.reserve_page < self.reserve_pages and not self.pending:
            self._query_reserve(self.reserve_page + 1)

    def logout(self):
        if self.pending or self._closing:
            return
        self.service.logout()
        self.notice.hide()
        self._sync_login()
        self._clear_result()
        self.batch.clear()
        self._clear_reserve_result()
        self.status.setText("已退出 MES")
        self.reserve_status.setText("已退出 MES，请重新登录")
        self._set_pending(False)
        self._restore_saved_login()
        self.username.setFocus()

    def _clear_session(self):
        if not self._closed_service:
            self._closed_service = True
            self.service.close()

    def accept(self):
        self.done(QDialog.DialogCode.Accepted)

    def reject(self):
        self.done(QDialog.DialogCode.Rejected)

    def done(self, result):
        if self._closing:
            return
        self._closing = True
        self._close_result = result
        self._clear_session()
        self.username.clear()
        self.password.clear()
        self.batch.clear()
        self._clear_result()
        self._clear_reserve_result()
        self.login_panel.setEnabled(False)
        self.query_panel.setEnabled(False)
        self.reserve_query_panel.setEnabled(False)
        self.tabs.setEnabled(False)
        self.logout_button.setEnabled(False)
        self.clear_login_button.setEnabled(False)
        self.status.setText("正在结束库存请求…")
        self.tasks.begin_shutdown()

    def _tasks_finished(self):
        if self._closing:
            super().done(self._close_result)
            if self._resume_parent_close and self.parentWidget():
                QTimer.singleShot(0, self.parentWidget().close)

    def closeEvent(self, event):
        self.reject()
        event.setAccepted(self.tasks.is_drained)
