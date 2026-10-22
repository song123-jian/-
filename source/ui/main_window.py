"""Customer price desktop window. All I/O goes through background services."""
from __future__ import annotations

import json
from pathlib import Path

from PySide6.QtCore import QEvent, QSettings, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QGuiApplication, QKeySequence, QShortcut, QStandardItem, QStandardItemModel
from PySide6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QCompleter,
    QDateEdit,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QLineEdit,
    QListView,
    QMainWindow,
    QProgressBar,
    QScrollArea,
    QSplitter,
    QStackedWidget,
    QTableView,
    QVBoxLayout,
    QWidget,
)

from domain import APP_NAME, VERSION, today
from services.backend_service import BackendService
from services.customer_service import CustomerService
from services.price_service import PriceService, QueryFilter
from services.sync_service import SyncState

from .business_document_dialog import BusinessDocumentDialog
from .combo_delegate import configure_combo_popup
from .customer_delegate import COUNT_ROLE, CustomerDelegate
from .customer_dialogs import CustomerManagerDialog
from .dialogs import (
    BackendDialog,
    HistoryDialog,
    ImportPreviewDialog,
    Notice,
    PdfImportOptionsDialog,
    QuoteDialog,
    button,
    label,
)
from .inventory_dialog import InventoryDialog
from .quote_delegate import QuoteDelegate
from .quote_table_model import PRICE_COLUMN, ROW_ROLE, QuoteProxyModel, QuoteTableModel
from .workers import TaskManager


class MainWindow(QMainWindow):
    accountClosed = Signal(bool)

    def __init__(self, context):
        super().__init__()
        self.context = context
        self.prices, self.backends = PriceService(context), BackendService(context)
        self.customer_service = CustomerService(context)
        self.customer_revisions = {}
        self.tasks = TaskManager(context, self)
        self.settings = QSettings(str(context.folder / "ui.ini"), QSettings.Format.IniFormat)
        self.query_sequence = 0
        self.meta_sequence = 0
        self.dialogs = set()
        self.inventory_dialog = None
        self.last_backup = None
        self.loaded = False
        self.import_customer = ""
        self.read_errors = {}
        self.notice_source = None
        self._closing = False
        self._waiting_for_tasks = False
        self._ready_to_close = False
        self._compact = None
        self._logout_on_close = False
        self._exit_requested = False
        self.tray = None
        self._customer_directory_state = None
        self._material_options = None
        self.sync_state = SyncState()
        self.sync_pending = False
        self.setWindowTitle(f"{APP_NAME} · {VERSION}")
        if getattr(context, 'account', None):
            self.setWindowTitle(f"{APP_NAME} · {context.account['username']} · {VERSION}")
        self.setMinimumSize(960, 640)
        self.resize(1440, 840)
        central = QWidget()
        central.setObjectName("MainSurface")
        outer = QVBoxLayout(central)
        outer.setContentsMargins(0, 0, 0, 0)
        self.splitter = QSplitter()
        outer.addWidget(self.splitter)
        self.setCentralWidget(central)
        self.build_sidebar()
        self.pages = QStackedWidget()
        self.splitter.addWidget(self.pages)
        self.splitter.setStretchFactor(1, 1)
        self.splitter.setSizes([240, 1040])
        self.build_query_page()
        self.build_data_page()
        self.build_settings_page()
        self.progress = QProgressBar()
        self.progress.setFixedWidth(140)
        self.progress.setRange(0, 0)
        self.progress.setTextVisible(False)
        self.progress.hide()
        self.statusBar().addPermanentWidget(self.progress)
        self.tasks.busyChanged.connect(self.busy_changed)
        self.tasks.allFinished.connect(self._finish_close)
        self.tasks.drained.connect(self._finish_close)
        self.tasks.allFinished.connect(lambda: setattr(self, 'sync_pending', False))
        self.debounce = QTimer(self)
        self.debounce.setSingleShot(True)
        self.debounce.setInterval(300)
        self.debounce.timeout.connect(self.query)
        self.success_timer = QTimer(self)
        self.success_timer.setSingleShot(True)
        self.success_timer.timeout.connect(self.notice.hide)
        self.sync_label = label('云端同步：等待首次读取', 'muted')
        self.statusBar().addPermanentWidget(self.sync_label)
        self.sync_timer = QTimer(self)
        self.sync_timer.setInterval(15_000)
        self.sync_timer.timeout.connect(self.poll_sync)
        if getattr(context, 'account', None):
            self.sync_timer.start()
        else:
            self.sync_label.hide()
        self.customer.textChanged.connect(lambda: self.debounce.start())
        self.customer.textChanged.connect(self.customer_search_changed)
        self.term.textChanged.connect(lambda: self.debounce.start())
        self.customer.returnPressed.connect(self.query)
        self.term.returnPressed.connect(self.query)
        for key, action in (("Ctrl+F", self.focus_search), ("Ctrl+N", self.new_quote), ("F5", self.refresh)):
            shortcut = QShortcut(QKeySequence(key), self)
            shortcut.activated.connect(action)
        self.copy_shortcut = QShortcut(QKeySequence.StandardKey.Copy, self.table)
        self.copy_shortcut.activated.connect(self.copy_selected)
        self.menuBar().setNativeMenuBar(False)
        file_menu = self.menuBar().addMenu("文件")
        for caption, action in (("新增报价", self.new_quote), ("库存查询", self.open_inventory), ("导入报价", self.import_file),
                                ("导出当前结果", lambda: self.export("current")), ("导出全部历史", lambda: self.export("history")),
                                ("完整备份", self.backup), ("退出", self.request_exit)):
            file_menu.addAction(caption, action)
        if getattr(context, 'account', None):
            self.menuBar().addMenu('账号').addAction('退出账号 / 切换使用者',self.logout_account)
        documents_menu = self.menuBar().addMenu("单据")
        documents_menu.addAction("制作报价单", lambda: self.open_business_document("quotation"))
        documents_menu.addAction("制作购销合同", lambda: self.open_business_document("contract"))
        geometry = self.settings.value("geometry")
        if geometry is not None:
            self.restoreGeometry(geometry)
        splitter_state = self.settings.value("splitter")
        if splitter_state is not None:
            self.splitter.restoreState(splitter_state)
        columns = self.settings.value("columns-v164")
        if columns is not None:
            self.table.horizontalHeader().restoreState(columns)
        else:
            previous_columns = self.settings.value("columns-v160")
            if previous_columns is not None and self.table.horizontalHeader().restoreState(previous_columns):
                self.table.setColumnWidth(PRICE_COLUMN, max(120, round(self.table.columnWidth(PRICE_COLUMN) * 2 / 3)))
        self.keep_price_width(PRICE_COLUMN, 0, self.table.columnWidth(PRICE_COLUMN))
        QTimer.singleShot(0, self, self.refresh)

    def build_sidebar(self):
        self.sidebar = QFrame()
        self.sidebar.setObjectName("Sidebar")
        self.sidebar.setMinimumWidth(240)
        layout = QVBoxLayout(self.sidebar)
        layout.setContentsMargins(16, 26, 16, 18)
        layout.setSpacing(12)
        layout.addWidget(label(APP_NAME, "title"))
        layout.addWidget(label("客户报价与历史账本", "muted"))
        layout.addSpacing(16)
        self.query_nav = button("报价查询", lambda: self.navigate(0))
        self.query_nav.setCheckable(True)
        self.query_nav.setChecked(True)
        self.data_nav = button("数据与导入", lambda: self.navigate(1))
        self.data_nav.setCheckable(True)
        for control in (self.query_nav, self.data_nav):
            layout.addWidget(control)
        self.inventory_nav = button("库存查询", self.open_inventory)
        self.inventory_nav.setAccessibleName("库存查询")
        layout.addWidget(self.inventory_nav)
        self.document_quote_nav = button("制作报价单", lambda: self.open_business_document("quotation"))
        self.document_contract_nav = button("制作购销合同", lambda: self.open_business_document("contract"))
        layout.addWidget(self.document_quote_nav)
        layout.addWidget(self.document_contract_nav)
        layout.addSpacing(12)
        layout.addWidget(label("客户目录", "muted"))
        self.customers = QListView()
        self.customers.setObjectName("Customers")
        self.customers.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.customers.setVerticalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.customers.setResizeMode(QListView.ResizeMode.Adjust)
        self.customers.setItemDelegate(CustomerDelegate(self.customers))
        self.customer_model = QStandardItemModel(self)
        self.customers.setModel(self.customer_model)
        self.customers.clicked.connect(self.select_customer)
        self.customers.activated.connect(self.select_customer)
        layout.addWidget(self.customers, 1)
        self.storage_label = label("● 本地 SQLite", "muted")
        self.storage_label.setWordWrap(True)
        storage_row = QHBoxLayout()
        storage_row.setSpacing(6)
        storage_row.addWidget(self.storage_label, 1)
        self.settings_nav = button("设置", lambda: self.navigate(2))
        self.settings_nav.setCheckable(True)
        self.settings_nav.setFixedWidth(56)
        self.settings_nav.setAccessibleName("数据库设置")
        self.settings_nav.setToolTip("数据库设置")
        storage_row.addWidget(self.settings_nav)
        layout.addLayout(storage_row)
        layout.addWidget(label(f"版本 {VERSION}", "muted"))
        layout.addWidget(button("退出程序", self.request_exit))
        self.splitter.addWidget(self.sidebar)

    def page_layout(self, title, subtitle):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(20, 18, 20, 14)
        layout.setSpacing(10)
        header = QHBoxLayout()
        directory_button = button("", self.toggle_sidebar, icon="menu")
        directory_button.setFixedWidth(38)
        directory_button.setToolTip("显示或收起客户目录")
        directory_button.setAccessibleName("显示或收起客户目录")
        header.addWidget(directory_button)
        header.addWidget(label(title, "title"))
        header.addStretch()
        layout.addLayout(header)
        text = label(subtitle, "muted")
        text.setWordWrap(True)
        layout.addWidget(text)
        self.pages.addWidget(page)
        return page, layout

    def build_query_page(self):
        self.query_page, layout = self.page_layout(APP_NAME, "导入确认后立即生效 · 文件日期优先，无日期按当天 · 价格单位元/kg")
        self.query_layout = layout
        self.query_subtitle = layout.itemAt(1).widget()
        self.cards_grid = QGridLayout()
        self.cards_grid.setSpacing(8)
        self.cards, self.card_values = [], []
        for caption, value in (("客户数", "—"), ("报价规格", "—"), ("历史记录", "—"), ("最近业务日期", "—")):
            card = QFrame()
            card.setProperty("role", "stat")
            column = QVBoxLayout(card)
            column.setContentsMargins(14, 10, 14, 10)
            column.addWidget(label(caption, "muted"))
            number = label(value, "number")
            if caption == "最近业务日期":
                number.setStyleSheet("font-size: 18px;")
            column.addWidget(number)
            self.cards.append(card)
            self.card_values.append(number)
        for index, card in enumerate(self.cards):
            self.cards_grid.addWidget(card, 0, index)
        layout.addLayout(self.cards_grid)
        self.notice = Notice()
        layout.addWidget(self.notice)
        panel = QFrame()
        panel.setProperty("role", "filterBand")
        filters = QVBoxLayout(panel)
        filters.setContentsMargins(12, 10, 12, 10)
        filters.setSpacing(8)
        grid = QGridLayout()
        grid.setSpacing(10)
        self.customer = QLineEdit()
        self.customer.setPlaceholderText("客户名称，支持部分匹配")
        self.customer.setAccessibleName("客户搜索")
        self.customer.setObjectName("CustomerSearch")
        self.term = QLineEdit()
        self.term.setPlaceholderText("牌号 / 材料 / 颜色 / 备注")
        self.term.setAccessibleName("牌号材料颜色搜索")
        grid.addWidget(self.customer, 0, 0, 1, 2)
        grid.addWidget(self.term, 0, 2, 1, 2)
        self.material = QComboBox()
        configure_combo_popup(self.material)
        self.material.addItem("全部材料", "")
        self.material.setAccessibleName("材料筛选")
        self.tax = QComboBox()
        configure_combo_popup(self.tax)
        self.tax.addItem("全部税口径", "")
        for tax in ("含税", "未税", "未注明"):
            self.tax.addItem(tax, tax)
        self.tax.setAccessibleName("税口径筛选")
        self.search_button = button("查询", self.query, True, "search")
        grid.addWidget(self.material, 1, 0)
        grid.addWidget(self.tax, 1, 1)
        grid.addWidget(self.search_button, 1, 2)
        grid.addWidget(button("重置", self.reset), 1, 3)
        for col in range(4):
            grid.setColumnStretch(col, 1)
        filters.addLayout(grid)
        more = QHBoxLayout()
        self.date_enabled = QCheckBox("日期范围")
        self.date_from, self.date_to = QDateEdit(), QDateEdit()
        from PySide6.QtCore import QDate
        for date in (self.date_from, self.date_to):
            date.setDisplayFormat("yyyy-MM-dd")
            date.setDateRange(QDate(1900, 1, 1), QDate(2200, 12, 31))
            date.setDate(QDate.fromString(today(), "yyyy-MM-dd"))
            date.setCalendarPopup(True)
            date.setEnabled(False)
            date.setMinimumWidth(116)
            date.setMaximumWidth(150)
            self.date_enabled.toggled.connect(date.setEnabled)
        self.stale = QCheckBox("超过60天未更新")
        more.addWidget(self.date_enabled)
        more.addWidget(self.date_from)
        more.addWidget(label("至"))
        more.addWidget(self.date_to)
        more.addStretch()
        more.addWidget(self.stale)
        filters.addLayout(more)
        layout.addWidget(panel)
        toolbar = QHBoxLayout()
        toolbar.setSpacing(8)
        self.new_button = button("新增报价", self.new_quote, True, "plus")
        self.history_button = button("价格历史", self.history_selected, icon="history")
        self.edit_button = button("更新价格", self.edit_selected)
        for control in (self.new_button, self.history_button, self.edit_button,
                        button("导入", self.import_file, icon="upload"),
                        button("导出", lambda: self.export("current"), icon="download"),
                        button("刷新", self.refresh, icon="refresh")):
            toolbar.addWidget(control)
        toolbar.addStretch()
        layout.addLayout(toolbar)
        self.empty_label = label("正在加载客户与报价…", "muted")
        self.empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.empty_label)
        self.table = QTableView()
        self.table.setObjectName("QuoteTable")
        self.model = QuoteTableModel(self)
        self.proxy = QuoteProxyModel(self)
        self.proxy.setSourceModel(self.model)
        self.table.setModel(self.proxy)
        self.delegate = QuoteDelegate(self.table)
        self.table.setItemDelegate(self.delegate)
        self.delegate.historyRequested.connect(self.open_history)
        self.delegate.editRequested.connect(self.edit_by_id)
        self.table.setSortingEnabled(True)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setShowGrid(True)
        self.table.setGridStyle(Qt.PenStyle.SolidLine)
        self.table.setWordWrap(False)
        self.table.setMouseTracking(True)
        self.table.verticalHeader().hide()
        self.table.verticalHeader().setDefaultSectionSize(46)
        self.table.setHorizontalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.table.setVerticalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        for col, width in enumerate((154, 104, 96, 68, 120, 88, 112, 100, 114)):
            self.table.setColumnWidth(col, width)
        self.table.horizontalHeader().setSectionResizeMode(7, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setMinimumSectionSize(60)
        self.table.horizontalHeader().setStretchLastSection(False)
        self.table.horizontalHeader().sectionResized.connect(self.keep_price_width)
        self.table.doubleClicked.connect(lambda index: self.open_history(index.data(ROW_ROLE)["id"]))
        self.table.selectionModel().selectionChanged.connect(self.selection_changed)
        layout.addWidget(self.table, 1)
        self.selection_changed()

    def keep_price_width(self, column, old_size, new_size):
        if column == PRICE_COLUMN and new_size < 120:
            self.table.setColumnWidth(PRICE_COLUMN, 120)

    def build_data_page(self):
        _, layout = self.page_layout("数据与导入", "导入先预览，报价按记录追加。导出与备份会保留完整价格精度。")
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        body = QWidget()
        panels = QVBoxLayout(body)
        panels.setContentsMargins(0, 0, 6, 0)
        scroll.setWidget(body)
        layout.addWidget(scroll, 1)
        layout = panels
        for title, description, actions in (
            ("客户管理", "删除客户会将其全部规格和历史移入回收站。可查看完整历史或恢复；日常查询和导出隐藏已删除客户。",
             [("管理客户", self.manage_customers, False), ("打开回收站", lambda: self.manage_customers(True), False)]),
            ("文件导入", "支持 XLSX、CSV 和文字表格 PDF。具体客户导入会匹配更新、合并新牌号；全部客户按文件客户列创建。确认导入立即生效，文件日期优先，无日期按当天。单文件20 MB、最多20000条报价；PDF 最多100页。",
             [("导入报价", self.import_file, True), ("保存导入模板", self.save_template, False)]),
            ("报价导出", "当前结果导出筛选后的当前 / 待生效报价；历史导出包含匹配规格的所有日期记录。CSV 为 UTF-8。",
             [("导出当前结果", lambda: self.export("current"), False), ("导出全部历史", lambda: self.export("history"), False)]),
            ("备份与恢复", "完整备份使用 SQLite 一致性快照。恢复前请退出并另存当前账本，再替换为核对过的备份。",
             [("保存完整备份", self.backup, True), ("打开备份目录", self.open_backup_folder, False)]),
        ):
            frame = QFrame()
            frame.setProperty("role", "panel")
            box = QVBoxLayout(frame)
            box.setContentsMargins(20, 18, 20, 18)
            box.addWidget(label(title, "heading"))
            text = label(description, "muted")
            text.setWordWrap(True)
            box.addWidget(text)
            buttons = QHBoxLayout()
            for caption, action, primary in actions:
                buttons.addWidget(button(caption, action, primary))
            buttons.addStretch()
            box.addLayout(buttons)
            layout.addWidget(frame)
        self.data_notice = Notice()
        layout.addWidget(self.data_notice)
        layout.addStretch()

    def build_settings_page(self):
        _, layout = self.page_layout("数据库设置", "在本地 SQLite 和 Supabase 之间切换。连接失败会显示原始操作状态。")
        panel = QFrame()
        panel.setProperty("role", "panel")
        box = QVBoxLayout(panel)
        box.setContentsMargins(22, 20, 22, 20)
        self.backend_description = label("")
        self.backend_description.setWordWrap(True)
        box.addWidget(self.backend_description)
        box.addWidget(button("打开数据库设置", self.backend_dialog, True, "database"))
        box.addWidget(button("保存 Supabase 建表与接口 SQL", self.save_schema))
        box.addWidget(button("保存 Supabase 报价功能升级 SQL（已有数据库）", self.save_workflow))
        if getattr(self.context, 'account', None):
            self.backend_description.setText('当前账号：' + self.context.account['username'] + '\n个人云端数据库，客户与报价按账号隔离。')
            for control in panel.findChildren(QWidget):
                if hasattr(control,'clicked'):
                    control.setEnabled(False)
            box.addWidget(button('退出账号 / 切换使用者',self.logout_account))
        self.reduce_motion = QCheckBox("减少界面动画")
        self.reduce_motion.setChecked(str(self.settings.value("reduce_motion", "true")).lower() == "true")
        box.addWidget(self.reduce_motion)
        layout.addWidget(panel)
        self.settings_notice = Notice()
        layout.addWidget(self.settings_notice)
        layout.addStretch()

    def navigate(self, page):
        self.pages.setCurrentIndex(page)
        for index, control in enumerate((self.query_nav, self.data_nav, self.settings_nav)):
            control.setChecked(index == page)

    def toggle_sidebar(self):
        sizes = self.splitter.sizes()
        self.splitter.setSizes([0, sum(sizes)] if sizes[0] else [232, max(1, sum(sizes) - 232)])

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if not hasattr(self, "cards_grid"):
            return
        compact = self.width() < 1120
        if compact != self._compact:
            self._compact = compact
            self.query_layout.setSpacing(8 if compact else 10)
            self.query_layout.setContentsMargins(*(14, 12, 14, 10) if compact else (20, 18, 20, 14))
            self.query_subtitle.setVisible(not compact)
            for card in self.cards:
                self.cards_grid.removeWidget(card)
                card.layout().setContentsMargins(14, 6 if compact else 10, 14, 6 if compact else 10)
            for index, number in enumerate(self.card_values):
                number.setStyleSheet("font-size: 18px;" if index == 3 else "font-size: 22px;" if compact else "")
            for index, card in enumerate(self.cards):
                self.cards_grid.addWidget(card, 0, index)

    def focus_search(self):
        self.navigate(0)
        self.customer.setFocus()
        self.customer.selectAll()

    def filters(self):
        return QueryFilter(self.customer.text(), self.term.text(), self.material.currentData() or "", self.tax.currentData() or "",
                           self.date_from.date().toString("yyyy-MM-dd") if self.date_enabled.isChecked() else "",
                           self.date_to.date().toString("yyyy-MM-dd") if self.date_enabled.isChecked() else "",
                           self.stale.isChecked())

    def refresh(self):
        generation = self.context.storage_generation
        self.meta_sequence += 1
        self.query_sequence += 1
        meta_sequence, sequence, filters = self.meta_sequence, self.query_sequence, self.filters()
        self.debounce.stop()
        self.tasks.cancel_reads("quote-query")

        def loaded(result):
            if meta_sequence == self.meta_sequence:
                self.meta_loaded(result["meta"])
            if sequence == self.query_sequence:
                self.quotes_loaded(result["quotes"])
                self.sync_applied(result['quotes'].get('sync'))

        def failed(exc):
            if getattr(self.context, 'account', None):
                self.sync_label.setText('云端同步：未更新，请检查网络或登录')
            if meta_sequence == self.meta_sequence:
                self.meta_failed(exc)
            if sequence == self.query_sequence:
                self.query_failed(exc)

        self.tasks.submit(lambda: self.prices.refresh_quotes(filters, generation, sequence), loaded, failed,
                          generation=generation, latest_key="quote-refresh")
        backend = self.backends.get_backend_status()
        name = "Supabase 云数据库" if backend["backend"] == "supabase" else "本地 SQLite"
        self.storage_label.setText("● " + name)
        if backend.get('managed_account'):
            self.backend_description.setText(f"当前账号：{backend['username']}\n个人云端数据库，客户与报价按账号隔离。\n个人文件目录：{self.context.folder}")
        else:
            self.backend_description.setText(f"当前存储：{name}\n数据目录：{self.context.folder}\n云端项目：{backend['url']}\n{'已保存加密凭据' if backend['has_key'] else '尚未配置云端凭据'}")

    def sync_applied(self, meta):
        if not meta:
            return
        if not meta.get('available'):
            self.sync_label.setText(meta.get('message', '云端尚未升级，当前仅手动刷新'))
            self.sync_timer.start(60_000)
            return
        self.sync_state.applied(meta)
        self.sync_timer.start(15_000)
        self.sync_label.setText('云端已读取：' + meta['last_read_at'][11:19])

    def poll_sync(self):
        if self._closing or self._exit_requested or self._logout_on_close or self.sync_pending or not self.isVisible() or self.isMinimized() or not self.isActiveWindow():
            return
        store = self.context.store
        if not hasattr(store, 'sync_meta') or self.tasks.write_count:
            return
        self.sync_pending = True

        def loaded(meta):
            self.sync_pending = False
            if meta is None:
                self.sync_label.setText('云端同步待升级；每60秒重检，可手动刷新')
                self.sync_timer.start(60_000)
            elif self.sync_state.observe(meta):
                self.sync_label.setText('云端已有变化，正在刷新；已打开表单需核对基准')
                self.refresh()
            else:
                self.sync_timer.setInterval(15_000)

        def failed(exc):
            self.sync_pending = False
            self.sync_label.setText('云端同步：未更新，请检查网络或登录')
            self.sync_timer.setInterval(self.sync_state.failed())

        self.tasks.submit(store.sync_meta, loaded, failed, generation=self.context.storage_generation,
                          latest_key='sync-meta')

    def changeEvent(self, event):
        super().changeEvent(event)
        if event.type() in (QEvent.Type.ActivationChange, QEvent.Type.WindowStateChange) and hasattr(self, 'sync_timer'):
            if not self.isMinimized() and self.isActiveWindow() and getattr(self.context, 'account', None):
                QTimer.singleShot(0, self, self.poll_sync)

    def meta_loaded(self, result):
        self.read_recovered("meta")
        self.customer_revisions = {entry["customer_key"]: entry["revision"] for entry in result["customers"]}
        customer_names = {entry["name"] for entry in result["customers"]}
        if self.import_customer and self.import_customer not in customer_names:
            self.import_customer = ""
        directory_state = (result["stats"]["items"], tuple(
            (entry["customer_key"], entry["name"], entry["count"]) for entry in result["customers"]))
        if directory_state != self._customer_directory_state:
            self.customer_model.clear()
            all_item = QStandardItem("全部客户")
            all_item.setData("", Qt.ItemDataRole.UserRole)
            all_item.setData("", Qt.ItemDataRole.UserRole + 1)
            all_item.setData(result["stats"]["items"], COUNT_ROLE)
            all_item.setToolTip(f"全部客户 · {result['stats']['items']}个规格")
            all_item.setData(all_item.toolTip(), Qt.ItemDataRole.AccessibleTextRole)
            all_item.setEditable(False)
            self.customer_model.appendRow(all_item)
            for entry in result["customers"]:
                item = QStandardItem(entry["name"])
                item.setData(entry["name"], Qt.ItemDataRole.UserRole)
                item.setData(entry["customer_key"], Qt.ItemDataRole.UserRole + 1)
                item.setData(entry["count"], COUNT_ROLE)
                item.setToolTip(f"{entry['name']} · {entry['count']}个规格")
                item.setData(item.toolTip(), Qt.ItemDataRole.AccessibleTextRole)
                item.setEditable(False)
                self.customer_model.appendRow(item)
            completer = QCompleter([entry["name"] for entry in result["customers"]], self.customer)
            completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
            completer.setFilterMode(Qt.MatchFlag.MatchContains)
            self.customer.setCompleter(completer)
            self._customer_directory_state = directory_state
        for row in range(self.customer_model.rowCount()):
            index = self.customer_model.index(row, 0)
            if index.data(Qt.ItemDataRole.UserRole) == self.import_customer:
                self.customers.setCurrentIndex(index)
                break
        materials = tuple(result["materials"])
        if materials != self._material_options:
            current_material = self.material.currentData()
            self.material.clear()
            self.material.addItem("全部材料", "")
            for material in materials:
                self.material.addItem(material, material)
            index = self.material.findData(current_material)
            if index >= 0:
                self.material.setCurrentIndex(index)
            self._material_options = materials

    def meta_failed(self, exc):
        self.read_failed("meta", exc)

    def query_failed(self, exc):
        self.read_failed("query", exc)

    def read_failed(self, source, exc):
        self.read_errors[source] = str(exc)
        self.notify(str(exc), True, source=source)

    def read_recovered(self, source):
        message = self.read_errors.pop(source, None)
        if message is None or self.notice_source != source:
            return
        if self.read_errors:
            remaining = next(reversed(self.read_errors))
            self.notify(self.read_errors[remaining], True, source=remaining)
            return
        for notice in (self.notice, self.data_notice, self.settings_notice):
            notice.hide()
        self.notice_source = None
        if self.statusBar().currentMessage() == message:
            self.statusBar().clearMessage()

    def query(self):
        self.debounce.stop()
        if self._closing:
            return
        self.query_sequence += 1
        sequence, generation, filters = self.query_sequence, self.context.storage_generation, self.filters()
        self.statusBar().showMessage("正在查询…")
        self.tasks.submit(lambda: self.prices.list_quotes(filters, generation, sequence),
                          lambda result: self.quotes_loaded(result) if sequence == self.query_sequence else None,
                          lambda exc: self.query_failed(exc) if sequence == self.query_sequence else None,
                          generation=generation, latest_key="quote-query")

    def quotes_loaded(self, result):
        self.read_recovered("query")
        self.loaded = True
        selected = self.selected()
        self.model.set_items(result["items"])
        stats = result["stats"]
        for label_value, value in zip(self.card_values, (stats["customers"], stats["items"], stats["records"], stats["last_date"] or "—")):
            label_value.setText(str(value))
        self.empty_label.setVisible(not result["items"])
        self.empty_label.setText("没有找到匹配报价\n试试较短的客户名称或牌号，也可以清除筛选")
        if selected:
            for index in range(self.proxy.rowCount()):
                if self.proxy.index(index, 0).data(ROW_ROLE)["id"] == selected["id"]:
                    self.table.selectRow(index)
                    break
        self.selection_changed()
        self.statusBar().showMessage(f"{self.storage_label.text()}  ·  {stats['customers']}客户 / {stats['items']}规格 / {stats['records']}条历史")

    def reset(self):
        self.import_customer = ""
        self.customer.clear()
        self.customers.setCurrentIndex(self.customer_model.index(0, 0))
        self.term.clear()
        self.material.setCurrentIndex(0)
        self.tax.setCurrentIndex(0)
        self.date_enabled.setChecked(False)
        self.stale.setChecked(False)
        self.query()

    def customer_search_changed(self, text):
        if text != self.import_customer:
            self.import_customer = ""
            self.customers.clearSelection()
            self.customers.setCurrentIndex(self.customer_model.index(-1, 0))

    def select_customer(self, index):
        self.navigate(0)
        customer = index.data(Qt.ItemDataRole.UserRole) or ""
        self.customer.setText(customer)
        self.import_customer = customer
        self.customers.setCurrentIndex(index)
        self.query()

    def selected(self):
        selected = self.table.selectionModel().selectedRows()
        return selected[0].data(ROW_ROLE) if selected else None

    def selection_changed(self):
        enabled = bool(self.selected())
        self.history_button.setEnabled(enabled)
        self.edit_button.setEnabled(enabled)

    def show_dialog(self, dialog):
        self.dialogs.add(dialog)
        dialog.finished.connect(lambda _: self.dialogs.discard(dialog))
        dialog.open()
        return dialog

    def open_inventory(self):
        if self._closing:
            return
        if self.inventory_dialog is not None and self.inventory_dialog.isVisible():
            self.inventory_dialog.raise_()
            self.inventory_dialog.activateWindow()
            return
        row = self.selected()
        self.inventory_dialog = InventoryDialog(
            grade=row["grade"] if row else "", parent=self, data_folder=getattr(self.context,'shared_folder',self.context.folder))
        self.show_dialog(self.inventory_dialog)

    def new_quote(self):
        dialog = QuoteDialog(self.prices, self.tasks, self.context.storage_generation,
                             customer=self.customer.text(), selected_customer=self.import_customer, parent=self)
        dialog.saved.connect(self.quote_saved)
        self.show_dialog(dialog)

    def open_business_document(self, kind):
        if not self._closing:
            self.show_dialog(BusinessDocumentDialog(
                self.context, self.tasks, kind, row=self.selected(),
                customer=self.import_customer, parent=self))

    def manage_customers(self, deleted=False):
        index = self.customers.currentIndex()
        key = index.data(Qt.ItemDataRole.UserRole + 1) if index.isValid() else ""
        dialog = CustomerManagerDialog(self.customer_service, self.tasks, self.context.storage_generation,
                                       deleted=deleted, selected_key=key or "", parent=self)
        dialog.changed.connect(self.customer_changed)
        self.show_dialog(dialog)

    def customer_changed(self, result):
        self.last_backup = result.get("backup") or self.last_backup
        self.import_customer = ""
        self.customer.clear()
        self.customer_revisions.clear()
        self.model.set_items([])
        self.meta_sequence += 1
        self.query_sequence += 1
        self.notify(result["message"])
        self.refresh()

    def edit_by_id(self, row_id):
        row = next((row for row in self.model.items if row["id"] == row_id), None)
        if row is None:
            # History can refer to a current record outside the last table refresh.
            self.failed(ValueError("该报价已变化，请刷新后再操作"))
            return
        dialog = QuoteDialog(self.prices, self.tasks, self.context.storage_generation, row=row, parent=self)
        dialog.saved.connect(self.quote_saved)
        self.show_dialog(dialog)

    def edit_selected(self):
        row = self.selected()
        if row:
            self.edit_by_id(row["id"])

    def history_selected(self):
        row = self.selected()
        if row:
            self.open_history(row["id"])

    def open_history(self, row_id):
        generation = self.context.storage_generation
        self.tasks.submit(lambda: self.prices.get_history(row_id, generation), self.history_loaded, self.failed, generation=generation)

    def history_loaded(self, result):
        dialog = HistoryDialog(result["items"], self)
        dialog.editRequested.connect(lambda row_id: (dialog.accept(), self.edit_by_id(row_id)))
        self.show_dialog(dialog)

    def quote_saved(self, result):
        self.last_backup = result.get("backup") or self.last_backup
        self.notify(result.get("message", "已保存报价"))
        self.refresh()

    def import_file(self):
        if self.customer.text().strip() and not self.import_customer:
            self.failed(ValueError("请先点击左侧具体客户再匹配导入；创建新客户请点击“全部客户”"))
            return
        options = {"customer_mode": "selected" if self.import_customer else "all",
                   "selected_customer": self.import_customer, "core_only": True}
        path, _ = QFileDialog.getOpenFileName(self, "导入报价", self.last_directory(), "报价文件 (*.xlsx *.csv *.pdf);;PDF 报价表 (*.pdf);;Excel / CSV (*.xlsx *.csv)")
        if path:
            self.remember_path(path)
            generation = self.context.storage_generation
            if Path(path).suffix.lower() == ".pdf":
                self.tasks.submit(lambda: self.prices.inspect_pdf(path, generation, options),
                                  lambda result: self.pdf_inspected(path, generation, result, options), self.failed, generation=generation)
            else:
                self.pdf_inspected(path, generation, {"defaults": {}, "warnings": [], "split_material_color": False}, options)

    def pdf_inspected(self, path, generation, inspection, import_options=None):
        customers = [self.customer_model.item(index).data(Qt.ItemDataRole.UserRole)
                     for index in range(1, self.customer_model.rowCount())]
        dialog = PdfImportOptionsDialog(Path(path).name, inspection, customers, self, import_options)
        dialog.previewRequested.connect(lambda options: self.start_import_preview(path, generation, options))
        self.show_dialog(dialog)

    def start_import_preview(self, path, generation, pdf_options=None):
        self.tasks.submit(lambda: self.prices.preview_import(path, generation, pdf_options),
                          self.preview_loaded, self.failed, generation=generation)

    def preview_loaded(self, result):
        dialog = ImportPreviewDialog(result, self.prices, self.tasks, self)
        dialog.imported.connect(self.imported)
        dialog.reselectRequested.connect(self.import_file)
        self.show_dialog(dialog)

    def imported(self, result):
        self.last_backup = result.get("backup")
        self.notify(f"导入完成：保存报价记录 {result['added']}，跳过 {result['skipped']}。" + (f"备份：{self.last_backup}" if self.last_backup else ""))
        self.refresh()

    def last_directory(self):
        return str(self.settings.value("last_directory", str(self.context.folder.parent)))

    def remember_path(self, path):
        self.settings.setValue("last_directory", str(Path(path).resolve().parent))

    def save_path(self, caption, name, filter_text):
        path, _ = QFileDialog.getSaveFileName(self, caption, str(Path(self.last_directory()) / name), filter_text)
        if path:
            if not Path(path).suffix:
                path += Path(name).suffix
            self.remember_path(path)
        return path

    def export(self, mode):
        path = self.save_path("导出报价", f"{'历史' if mode == 'history' else '当前'}价格-{today()}.csv", "CSV 文件 (*.csv)")
        if path:
            generation, filters = self.context.storage_generation, self.filters()
            self.tasks.submit(lambda: self.prices.export_quotes(filters, mode, path, generation), self.file_saved, self.failed, generation=generation, write=True)

    def backup(self):
        path = self.save_path("保存完整备份", f"价格完整备份-{today()}.sqlite3", "SQLite 备份 (*.sqlite3)")
        if path:
            generation = self.context.storage_generation
            self.tasks.submit(lambda: self.prices.backup_database(path, generation), self.file_saved, self.failed, generation=generation, write=True)

    def save_template(self):
        path = self.save_path("保存导入模板", "价格导入模板.csv", "CSV 文件 (*.csv)")
        if path:
            self.tasks.submit(lambda: self.prices.save_import_template(path), self.file_saved, self.failed, write=True)

    def save_schema(self):
        path = self.save_path("保存云端结构 SQL", "Supabase建表与接口.sql", "SQL 文件 (*.sql)")
        if path:
            self.tasks.submit(lambda: self.prices.save_cloud_schema(path), self.file_saved, self.failed, write=True)

    def save_workflow(self):
        path = self.save_path("保存报价功能升级 SQL", "Supabase报价完善与即时生效-1.6.0.sql", "SQL 文件 (*.sql)")
        if path:
            self.tasks.submit(lambda: self.prices.save_cloud_workflow(path), self.file_saved, self.failed, write=True)

    def file_saved(self, result):
        self.last_backup = result["path"] if result["path"].endswith(".sqlite3") else self.last_backup
        self.notify("已保存：" + result["path"])

    def open_backup_folder(self):
        path = Path(self.last_backup).parent if self.last_backup else self.context.folder / "backups"
        path.mkdir(exist_ok=True)
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))

    def backend_dialog(self):
        if getattr(self.context, 'account', None):
            self.notify('当前使用个人云端数据库，请通过账号菜单切换使用者')
            return
        dialog = BackendDialog(self.backends, self.tasks, self)
        dialog.switched.connect(self.backend_switched)
        self.show_dialog(dialog)

    def backend_switched(self, result):
        self.notify(result["message"], bool(result.get("warning")))
        self.loaded = False
        self.import_customer = ""
        self.customer.clear()
        self.model.set_items([])
        self.refresh()

    def copy_selected(self):
        row = self.selected()
        if row:
            QGuiApplication.clipboard().setText(json.dumps(row, ensure_ascii=False, indent=2))

    def notify(self, message, error=False, *, source=None):
        self.success_timer.stop()
        self.notice_source = source
        for notice in (self.notice, self.data_notice, self.settings_notice):
            notice.show_message(message, error)
        self.statusBar().showMessage(str(message))
        if not error:
            self.success_timer.start(5000)

    def failed(self, exc):
        self.notify(str(exc), True)

    def busy_changed(self, busy):
        self.progress.setVisible(busy)

    def request_exit(self):
        if self._closing:
            return
        self._exit_requested = True
        if self.tray is not None:
            self.tray.restore()
        self.close()
        if not self._closing and not self._ready_to_close:
            self._exit_requested = False

    def logout_account(self):
        if self._closing:
            return
        self._logout_on_close = True
        if self.tray is not None:
            self.tray.restore()
        self.close()
        if not self._closing and not self._ready_to_close:
            self._logout_on_close = False

    def closeEvent(self, event):
        if not (self._ready_to_close or self._closing or self._exit_requested or self._logout_on_close
                or QGuiApplication.instance().isSavingSession()):
            if self.tray is not None and self.tray.minimize():
                event.ignore()
                return
        if self._ready_to_close:
            self.settings.setValue("geometry", self.saveGeometry())
            self.settings.setValue("splitter", self.splitter.saveState())
            self.settings.setValue("columns-v164", self.table.horizontalHeader().saveState())
            self.settings.setValue("reduce_motion", self.reduce_motion.isChecked())
            self.settings.sync()
            event.accept()
            if getattr(self.context, 'account', None):
                self.accountClosed.emit(self._logout_on_close)
            return
        for dialog in tuple(self.dialogs):
            if dialog.isVisible():
                if isinstance(dialog, InventoryDialog):
                    dialog._resume_parent_close = True
                dialog.reject()
                if dialog.isVisible():
                    event.ignore()
                    return
        event.ignore()
        if self._closing:
            return
        self._closing = True
        self.debounce.stop()
        self.sync_timer.stop()
        self.success_timer.stop()
        self.centralWidget().setEnabled(False)
        self.statusBar().showMessage("正在等待后台操作结束并保存界面设置…")
        self.tasks.begin_shutdown()
        self._waiting_for_tasks = True
        self._finish_close()

    def _finish_close(self):
        if (self._closing and self._waiting_for_tasks and not self._ready_to_close
                and not self.tasks.jobs and self.tasks.read_pool.activeThreadCount() == 0
                and self.tasks.write_pool.activeThreadCount() == 0):
            self._waiting_for_tasks = False
            self.context.closing = True
            self._ready_to_close = True
            QTimer.singleShot(0, self, self.close)
