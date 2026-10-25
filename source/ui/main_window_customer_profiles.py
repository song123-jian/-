"""Customer master page and fixed-template file actions."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QAbstractItemView,
    QFileDialog,
    QHBoxLayout,
    QHeaderView,
    QLineEdit,
    QMessageBox,
    QTableWidget,
    QTableWidgetItem,
)

from .customer_profile_dialog import CustomerProfileDialog
from .dialogs import Notice, button, label
from .query_shortcuts import bind_enter_query


class MainWindowCustomerProfilesMixin:
    def build_customer_profiles_page(self):
        self.customer_profiles_page, layout = self.page_layout(
            "客户管理", "客户名称、联系人、电话、行业、地址和备注均可留空并手动维护。")
        toolbar = self._profile_toolbar()
        layout.addLayout(toolbar)
        layout.addLayout(self._profile_actions())
        actions = QHBoxLayout()
        self.profile_quote_button = button("查看报价", self.open_customer_profile_quotes)
        self.profile_project_button = button("新增项目", self.new_customer_profile_project)
        self.profile_todo_button = button("新增跟进待办", self.create_customer_todo)
        self.profile_link_buttons = (self.profile_quote_button, self.profile_project_button, self.profile_todo_button)
        for control in self.profile_link_buttons:
            control.setEnabled(False)
            actions.addWidget(control)
        actions.addStretch()
        layout.addLayout(actions)
        self.customer_profile_table = QTableWidget(0, 6)
        self.customer_profile_table.setObjectName("CustomerProfileTable")
        self.customer_profile_table.setHorizontalHeaderLabels(["客户名称", "联系人", "电话", "行业", "地址", "备注"])
        self.customer_profile_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.customer_profile_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.customer_profile_table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.customer_profile_table.setAlternatingRowColors(True)
        self.customer_profile_table.setWordWrap(True)
        self.customer_profile_table.verticalHeader().hide()
        self.customer_profile_table.verticalHeader().setDefaultSectionSize(38)
        header = self.customer_profile_table.horizontalHeader()
        header.setMinimumSectionSize(76)
        for column, width in enumerate((145, 90, 125, 95, 155, 180)):
            mode = QHeaderView.ResizeMode.Stretch if column in (0, 4, 5) else QHeaderView.ResizeMode.Interactive
            header.setSectionResizeMode(column, mode)
            self.customer_profile_table.setColumnWidth(column, width)
        header.setStretchLastSection(False)
        self.customer_profile_table.setHorizontalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.customer_profile_table.itemSelectionChanged.connect(self.customer_profile_selection_changed)
        self.customer_profile_table.itemDoubleClicked.connect(lambda _item: self.edit_customer_profile())
        layout.addWidget(self.customer_profile_table, 1)
        self.customer_profile_notice = Notice()
        layout.addWidget(self.customer_profile_notice)
        self.profile_edit_button.setEnabled(False)

    def _profile_toolbar(self):
        toolbar = QHBoxLayout()
        self.customer_profile_status = label("正在读取客户资料…", "muted")
        toolbar.addWidget(self.customer_profile_status)
        toolbar.addStretch()
        self.customer_profile_search = QLineEdit()
        self.customer_profile_search.setPlaceholderText("搜索客户、联系人、电话、行业或备注")
        self.customer_profile_search.setAccessibleName("搜索客户资料")
        self.customer_profile_search.setMinimumWidth(230)
        self.customer_profile_search.textChanged.connect(self.render_customer_profiles)
        self.profile_enter_query = bind_enter_query(self.render_customer_profiles, self.customer_profile_search)
        toolbar.addWidget(self.customer_profile_search)
        return toolbar

    def _profile_actions(self):
        toolbar = QHBoxLayout()
        self.profile_new_button = button("新增客户", self.new_customer_profile, primary=True)
        self.profile_edit_button = button("编辑", self.edit_customer_profile)
        self.profile_import_button = button("导入", self.import_customer_profiles)
        self.profile_export_button = button("导出", self.export_customer_profiles)
        self.profile_template_button = button("下载模板", self.save_customer_profile_template)
        for control in (self.profile_new_button, self.profile_edit_button, self.profile_import_button,
                        self.profile_export_button, self.profile_template_button):
            toolbar.addWidget(control)
        return toolbar

    def load_customer_profiles(self, generation=None):
        if self._closing:
            return
        generation = generation or self.context.storage_generation
        self.customer_profile_sequence += 1
        sequence = self.customer_profile_sequence
        self.customer_profile_status.setText("正在读取客户资料…")
        self.tasks.submit(
            lambda: self.customer_profile_service.list_profiles(generation),
            lambda profiles: self.customer_profiles_loaded(profiles) if sequence == self.customer_profile_sequence else None,
            lambda exc: self.customer_profiles_failed(exc) if sequence == self.customer_profile_sequence else None,
            generation=generation, latest_key="customer-profiles")

    def customer_profiles_loaded(self, profiles):
        self.customer_profiles = profiles
        self.customer_profile_status.setText(f"{len(profiles)} 位客户")
        if self.customer_profile_service.local_only:
            self.customer_profile_status.setText(f"{len(profiles)} 位客户 · 仅本机")
            self.customer_profile_notice.show_message("云端客户接口未部署，资料保存在当前账号本机目录；暂不跨设备同步。")
        self.render_customer_profiles()
        if hasattr(self, "todo_items"):
            self.load_todos()

    def customer_profiles_failed(self, exc):
        self.customer_profile_status.setText("客户资料读取失败")
        self.failed(exc)

    def render_customer_profiles(self, *_args):
        if not hasattr(self, "customer_profile_table"):
            return
        query = self.customer_profile_search.text().strip().casefold()
        fields = ("name", "contact", "phone", "industry", "address", "notes")
        profiles = [profile for profile in getattr(self, "customer_profiles", [])
                    if not query or query in " ".join(str(profile.get(field) or "") for field in fields).casefold()]
        table = self.customer_profile_table
        selected_id = self.selected_customer_profile_id()
        table.setRowCount(len(profiles))
        selected_row = None
        for row, profile in enumerate(profiles):
            for column, field in enumerate(fields):
                cell = QTableWidgetItem(str(profile.get(field) or ""))
                cell.setFlags(cell.flags() & ~Qt.ItemFlag.ItemIsEditable)
                cell.setToolTip(str(profile.get(field) or ""))
                if column == 0:
                    cell.setData(Qt.ItemDataRole.UserRole, profile["profile_id"])
                    cell.setData(Qt.ItemDataRole.UserRole + 1, profile["revision"])
                table.setItem(row, column, cell)
            if profile["profile_id"] == selected_id:
                selected_row = row
        if selected_row is not None:
            table.selectRow(selected_row)
        table.resizeRowsToContents()
        self.customer_profile_selection_changed()

    def selected_customer_profile_id(self):
        table = getattr(self, "customer_profile_table", None)
        if table is None:
            return None
        rows = table.selectionModel().selectedRows()
        if not rows:
            return None
        item = table.item(rows[0].row(), 0)
        return item.data(Qt.ItemDataRole.UserRole) if item else None

    def selected_customer_profile(self):
        profile_id = self.selected_customer_profile_id()
        return next((item for item in getattr(self, "customer_profiles", [])
                     if item["profile_id"] == profile_id), None)

    def customer_profile_selection_changed(self):
        selected = self.selected_customer_profile()
        self.profile_edit_button.setEnabled(selected is not None)
        for control in self.profile_link_buttons:
            control.setEnabled(selected is not None)
        self.profile_quote_button.setEnabled(bool(selected and selected.get("name")))

    def open_customer_profile_quotes(self):
        profile = self.selected_customer_profile()
        if not profile or not profile["name"].strip():
            return
        self.navigate(self.PAGE_QUERY)
        self.customer.setText(profile["name"])
        self.import_customer = ""
        self.refresh()

    def new_customer_profile_project(self):
        from .project_progress_dialog import ProjectProgressDialog

        profile = self.selected_customer_profile()
        if profile is None:
            return
        dialog = ProjectProgressDialog(self.project_rules, parent=self, customer_profiles=self.customer_profiles)
        dialog.controls["customer_name"].setText(profile["name"])
        dialog.controls["industry"].setText(profile["industry"])
        dialog.saved.connect(self.save_project_progress)
        self.show_dialog(dialog)

    def new_customer_profile(self):
        dialog = CustomerProfileDialog(parent=self)
        dialog.saved.connect(self.save_customer_profile)
        self.show_dialog(dialog)

    def edit_customer_profile(self):
        profile = self.selected_customer_profile()
        if profile:
            dialog = CustomerProfileDialog(profile, self)
            dialog.saved.connect(self.save_customer_profile)
            self.show_dialog(dialog)

    def save_customer_profile(self, values):
        generation = self.context.storage_generation
        self.tasks.submit(
            lambda: self.customer_profile_service.save_profile(values, generation),
            self.customer_profile_saved, self.customer_profiles_failed,
            generation=generation, write=True)

    def customer_profile_saved(self, profile):
        self.customer_profile_notice.show_message("客户资料已保存")
        self.load_customer_profiles()

    def import_customer_profiles(self):
        path, _ = QFileDialog.getOpenFileName(self, "导入客户资料", "", "Excel 工作簿 (*.xlsx)")
        if not path:
            return
        prompt = QMessageBox(self)
        prompt.setIcon(QMessageBox.Icon.Question)
        prompt.setWindowTitle("导入客户资料")
        prompt.setText("将按照固定模板的系统编号和数据版本新增或更新客户资料。")
        import_button = prompt.addButton("导入", QMessageBox.ButtonRole.AcceptRole)
        cancel_button = prompt.addButton("取消", QMessageBox.ButtonRole.RejectRole)
        prompt.setDefaultButton(cancel_button)
        prompt.exec()
        if prompt.clickedButton() != import_button:
            return
        generation = self.context.storage_generation
        self.customer_profile_status.setText("正在导入客户资料…")
        self.tasks.submit(
            lambda: self.customer_profile_service.import_file(path, generation),
            self.customer_profiles_imported, self.customer_profiles_failed,
            generation=generation, write=True)

    def customer_profiles_imported(self, result):
        self.customer_profile_notice.show_message(
            f"导入完成：新增 {result['created']} 条，更新 {result['updated']} 条，未变化 {result['skipped']} 条")
        self.load_customer_profiles()

    def export_customer_profiles(self):
        path, _ = QFileDialog.getSaveFileName(self, "导出客户资料", "客户资料.xlsx", "Excel 工作簿 (*.xlsx)")
        if not path:
            return
        if not path.lower().endswith(".xlsx"):
            path += ".xlsx"
        generation = self.context.storage_generation
        self.customer_profile_status.setText("正在导出客户资料…")
        self.tasks.submit(
            lambda: self.customer_profile_service.export_file(path, generation),
            lambda result: self._customer_profile_file_saved(result, "客户资料已导出"),
            self.customer_profiles_failed, generation=generation, write=True)

    def save_customer_profile_template(self):
        path, _ = QFileDialog.getSaveFileName(self, "保存客户资料模板", "客户资料模板.xlsx", "Excel 工作簿 (*.xlsx)")
        if not path:
            return
        if not path.lower().endswith(".xlsx"):
            path += ".xlsx"
        self.tasks.submit(
            lambda: self.customer_profile_service.save_template(path),
            lambda result: self._customer_profile_file_saved(result, "客户资料模板已保存"),
            self.customer_profiles_failed, write=True)

    def _customer_profile_file_saved(self, result, message):
        self.customer_profile_status.setText(message)
        self.customer_profile_notice.show_message(message)
