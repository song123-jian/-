"""Narrow packaged UI acceptance, selected only inside an explicit isolated smoke directory."""
from __future__ import annotations

import sys

from PySide6.QtCore import QDate, QLocale, Qt, QTimer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox, QPushButton, QSystemTrayIcon

from qa_runner import PackagedSmoke
from services.customer_profile_service import _profile_workbook, parse_customer_profiles
from services.project_progress_service import score_project, validate_project
from ui.quote_table_model import ROW_ROLE
from ui.system_tray import SystemTray


class PackagedDesktopShellSmoke(PackagedSmoke):
    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        assert self.window.pages.currentIndex() == self.window.PAGE_QUERY
        assert [item.text() for item in self.window.primary_navigation[:2]] == ["客户管理", "待办事项"]
        self.report["scope"] = "isolated customer profiles, todo, custom project values, navigation and native tray"
        self.report["cloud_or_business_data_accessed"] = False
        self.report["platform"] = QApplication.instance().platformName()
        self.report["entry"] = sys.executable
        self.tray = SystemTray(QApplication.instance(), self)
        self.tray.attach(self.window)
        assert QSystemTrayIcon.isSystemTrayAvailable() and self.tray.icon.isVisible(), "当前Windows会话无可用托盘"
        self.report["checks"]["native_tray_visible"] = True
        self.window.resize(960, 640)
        QTimer.singleShot(150, self, lambda: self.safe(self.navigation_begin))

    def navigation_begin(self):
        self.quote(None, "10.5", self.navigation_seed_saved)

    def navigation_seed_saved(self):
        window = self.window
        self.navigation_total = len(window.context.store.all())
        self.navigation_cases = [(page, activation, customer) for page in (
            window.PAGE_CUSTOMERS, window.PAGE_TODO, window.PAGE_QUERY,
            window.PAGE_PROJECT_PROGRESS, window.PAGE_SETTINGS)
            for activation in ("click", "keyboard") for customer in (self.customer, "")]
        self.navigation_checked = 0
        window.refresh()
        self.await_idle(self.navigation_step)

    def navigation_step(self):
        window = self.window
        if not self.navigation_cases:
            self.report["checks"]["customer_directory_click_keyboard_all_pages"] = self.navigation_checked == 20
            self.report["navigation_cases"] = self.navigation_checked
            window.focus_search()
            assert window.pages.currentIndex() == window.PAGE_QUERY and window.query_nav.isChecked()
            self.report["checks"]["sidebar_and_search_navigation_targets"] = True
            window.customer.setText(self.customer)
            window.query()
            self.await_idle(self.navigation_quote_actions)
            return
        page, activation, customer = self.navigation_cases.pop(0)
        control = (*window.primary_navigation, window.settings_nav)[page]
        QTest.mouseClick(control, Qt.MouseButton.LeftButton)
        assert window.pages.currentIndex() == page and control.isChecked()
        assert sum(button.isChecked() for button in (*window.primary_navigation, window.settings_nav)) == 1
        self.navigation_customer = customer
        self.navigation_activation = activation
        self.await_idle(self.navigation_select)

    def navigation_select(self):
        window = self.window
        index = next(window.customer_model.index(row, 0) for row in range(window.customer_model.rowCount())
                     if window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) == self.navigation_customer)
        window.customers.scrollTo(index)
        if self.navigation_activation == "click":
            QTest.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton,
                             pos=window.customers.visualRect(index).center())
        else:
            window.customers.setCurrentIndex(index)
            window.customers.setFocus()
            QTest.keyClick(window.customers, Qt.Key.Key_Return)
        assert window.pages.currentIndex() == window.PAGE_QUERY and window.query_nav.isChecked()
        assert not window.customer_nav.isChecked() and window.table.isVisible()
        assert window.customer.text() == window.import_customer == self.navigation_customer
        self.await_idle(self.navigation_result)

    def navigation_result(self):
        window = self.window
        expected = window.context.store.list({"customer": self.navigation_customer})["items"]
        assert window.model.rowCount() == len(expected) > 0
        assert len(window.context.store.all()) == self.navigation_total
        if self.navigation_customer:
            assert all(window.model.index(row, 0).data(ROW_ROLE)["customer"] == self.navigation_customer
                       for row in range(window.model.rowCount()))
        self.navigation_checked += 1
        self.navigation_step()

    def navigation_quote_actions(self):
        window = self.window
        window.table.selectRow(0)
        self.navigation_quote_id = window.selected()["id"]
        QTest.mouseClick(window.edit_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        assert dialog.row["id"] == self.navigation_quote_id
        assert dialog.fields["customer"].text() == self.customer
        dialog.accept()
        QTest.mouseClick(window.history_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.navigation_history)

    def navigation_history(self):
        from ui.dialogs import HistoryDialog

        window = self.window
        dialog = next(iter(window.dialogs))
        assert isinstance(dialog, HistoryDialog)
        assert window.selected()["id"] == self.navigation_quote_id
        assert len(window.context.store.history(self.navigation_quote_id)["items"]) == 1
        dialog.accept()
        self.report["checks"]["directory_quote_edit_and_history_targets"] = True
        self.capture(window, "customer-directory-quotes-960.png")
        window.customer.clear()
        window.query()
        self.await_idle(self.query_shortcuts_begin)

    def query_shortcuts_begin(self):
        window = self.window
        self.shortcut_cases = [(field, key) for field in (
            'customer', 'term', 'material', 'tax', 'date_from', 'date_to')
            for key in (Qt.Key.Key_Return, Qt.Key.Key_Enter)]
        self.shortcut_checked = 0
        window.date_enabled.setChecked(True)
        self.query_shortcut_step()

    def query_shortcut_step(self):
        window = self.window
        if not self.shortcut_cases:
            window.date_enabled.setChecked(False)
            self.report['checks']['enter_quote_controls_once'] = self.shortcut_checked == 12
            self.local_shortcut_cases = [(page, field, table, key) for page, field, table in (
                (window.PAGE_CUSTOMERS, 'customer_profile_search', 'customer_profile_table'),
                (window.PAGE_TODO, 'todo_search', 'todo_table'),
                (window.PAGE_TODO, 'todo_category_filter', 'todo_table'),
                (window.PAGE_TODO, 'todo_status_filter', 'todo_table'),
                (window.PAGE_TODO, 'todo_priority_filter', 'todo_table'))
                for key in (Qt.Key.Key_Return, Qt.Key.Key_Enter)]
            self.local_shortcut_step()
            return
        field, key = self.shortcut_cases.pop(0)
        control = getattr(window, field)
        control.setFocus()
        self.shortcut_sequence = window.query_sequence
        QTest.keyClick(control, key)
        self.await_idle(self.query_shortcut_result)

    def query_shortcut_result(self):
        assert self.window.query_sequence == self.shortcut_sequence + 1
        assert self.window.pages.currentIndex() == self.window.PAGE_QUERY and not self.window.dialogs
        self.shortcut_checked += 1
        self.query_shortcut_step()

    def local_shortcut_step(self):
        window = self.window
        if not self.local_shortcut_cases:
            self.report['checks']['enter_local_search_and_filters'] = True
            self.report['enter_query_cases'] = 22
            window.navigate(window.PAGE_QUERY)
            window.reset()
            self.await_idle(self.directory_disclosure)
            return
        self.local_shortcut_case = self.local_shortcut_cases.pop(0)
        window.navigate(self.local_shortcut_case[0])
        self.await_idle(self.local_shortcut_action)

    def local_shortcut_action(self):
        window = self.window
        page, field, table, key = self.local_shortcut_case
        grid = getattr(window, table)
        count = grid.rowCount()
        grid.setRowCount(count + 1)
        control = getattr(window, field)
        if hasattr(control, 'isEditable') and control.isEditable():
            control = control.lineEdit()
        control.setFocus()
        before = window.query_sequence
        QTest.keyClick(control, key)
        assert grid.rowCount() == count and window.query_sequence == before
        assert window.pages.currentIndex() == page and not window.dialogs
        self.local_shortcut_step()

    def directory_disclosure(self):
        window = self.window
        count = window.model.rowCount()
        QTest.mouseClick(window.customer_directory_toggle, Qt.MouseButton.LeftButton)
        assert not window.customers.isVisible() and window.model.rowCount() == count
        window.settings.sync()
        assert str(window.settings.value('customer-directory-expanded')).lower() == 'false'
        self.capture(window, 'customer-directory-collapsed-960.png')
        window.refresh()
        self.await_idle(self.directory_reopen)

    def directory_reopen(self):
        window = self.window
        assert not window.customers.isVisible()
        window.customer_directory_toggle.setFocus()
        QTest.keyClick(window.customer_directory_toggle, Qt.Key.Key_Space)
        assert window.customers.isVisible() and window.customer_directory_toggle.isChecked()
        self.report['checks']['customer_directory_collapse_refresh_keyboard'] = True
        self.await_idle(self.customer_begin)

    def customer_begin(self):
        self.window.navigate(self.window.PAGE_CUSTOMERS)
        self.await_idle(self.customer_create)

    def customer_create(self):
        window = self.window
        assert window.width() == 960
        assert window.profile_template_button.mapTo(window, window.profile_template_button.rect().bottomRight()).x() < 960
        assert QLocale().name() == "zh_CN"
        assert QApplication.translate("QPlatformTheme", "Cancel") == "取消"
        assert window.customer_profile_table.rowCount() == 0
        assert window.customer_profile_table.columnCount() == 6
        assert window.customer_profile_table.horizontalHeaderItem(5).text() == '备注'
        assert window.customer_profile_table.horizontalScrollBar().maximum() == 0
        QTest.mouseClick(window.profile_new_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        assert all(not field.text() for field in (dialog.name, dialog.contact, dialog.phone, dialog.industry))
        QTest.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.customer_edit)

    def customer_edit(self):
        window = self.window
        assert len(window.customer_profiles) == 1
        self.profile = window.customer_profiles[0]
        assert all(self.profile[field] == "" for field in ("name", "contact", "phone", "industry", "address"))
        window.customer_profile_table.selectRow(0)
        QTest.mouseClick(window.profile_edit_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        dialog.name.setText("隔离客户资料验收")
        dialog.contact.setText("测试联系人")
        dialog.industry.setText("汽车零部件")
        dialog.notes.setPlainText('试样跟进备注'+chr(10)+'允许空白和手动修改')
        assert dialog.save_button.isVisible() and dialog.notes.isVisible()
        QTest.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.customer_links)

    def customer_links(self):
        window = self.window
        self.profile = window.customer_profiles[0]
        assert self.profile['notes'] == '试样跟进备注'+chr(10)+'允许空白和手动修改'
        assert self.profile["name"] == "隔离客户资料验收" and self.profile["phone"] == self.profile["address"] == ""
        window.customer_profile_table.selectRow(0)
        QTest.mouseClick(window.profile_project_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        assert dialog.controls["customer_name"].text() == self.profile["name"]
        assert dialog.controls["industry"].text() == self.profile["industry"]
        dialog.controls["customer_name"].setText("手动填写客户")
        assert dialog.controls["customer_name"].text() == "手动填写客户"
        dialog.accept()
        QTest.mouseClick(window.profile_quote_button, Qt.MouseButton.LeftButton)
        assert window.pages.currentIndex() == window.PAGE_QUERY and window.customer.text() == self.profile["name"]
        window.new_quote()
        dialog = next(iter(window.dialogs))
        assert dialog.fields["customer"].text() == self.profile["name"] and not dialog.fields["customer"].isReadOnly()
        dialog.accept()
        window.navigate(window.PAGE_CUSTOMERS)
        self.await_idle(self.customer_linked_todo)

    def customer_linked_todo(self):
        window = self.window
        window.customer_profile_table.selectRow(0)
        QTest.mouseClick(window.profile_todo_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        assert dialog.customer_field.currentData() == self.profile["profile_id"]
        dialog.title_field.setText("等待试样反馈")
        dialog.status_field.setCurrentIndex(dialog.status_field.findData("waiting"))
        QTest.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
        assert window.todo_service.list_items()[0]["status"] == "waiting"
        QTest.mouseClick(window.profile_edit_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        dialog.name.setText("隔离客户资料已修改")
        QTest.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.customer_export)

    def customer_export(self):
        window = self.window
        assert window.todo_items[0]["customer_name"] == "隔离客户资料已修改"
        self.export_path = self.output / "客户资料往返.xlsx"
        original = QFileDialog.getSaveFileName
        QFileDialog.getSaveFileName = lambda *_a, **_k: (str(self.export_path), "")
        try:
            QTest.mouseClick(window.profile_export_button, Qt.MouseButton.LeftButton)
        finally:
            QFileDialog.getSaveFileName = original
        self.await_idle(self.customer_import)

    def customer_import(self):
        window = self.window
        records = parse_customer_profiles(self.export_path.read_bytes())
        assert len(records) == 1 and records[0]["name"] == "隔离客户资料已修改"
        assert records[0]['notes'] == '试样跟进备注'+chr(10)+'允许空白和手动修改'
        records.append({"name": "", "contact": "模板联系人", "phone": "0013800012345"})
        self.export_path.write_bytes(_profile_workbook(records))
        original = QFileDialog.getOpenFileName
        QFileDialog.getOpenFileName = lambda *_a, **_k: (str(self.export_path), "")
        def confirm_import():
            prompt = QApplication.activeModalWidget()
            if not isinstance(prompt, QMessageBox):
                raise AssertionError("未显示导入确认框")
            next(button for button in prompt.buttons() if button.text() == "导入").click()
        QTimer.singleShot(50, lambda: self.safe(confirm_import))
        try:
            QTest.mouseClick(window.profile_import_button, Qt.MouseButton.LeftButton)
        finally:
            QFileDialog.getOpenFileName = original
        self.await_idle(self.customer_done)

    def customer_done(self):
        window = self.window
        assert len(window.customer_profiles) == 2
        assert any(item["name"] == "" and item["phone"] == "0013800012345" for item in window.customer_profiles)
        assert "新增 1 条" in window.customer_profile_notice.text.text()
        window.customer_profile_search.setText("模板联系人")
        assert window.customer_profile_table.rowCount() == 1
        window.customer_profile_search.clear()
        self.report["checks"]["customer_blank_edit_template_round_trip_links"] = True
        self.report['checks']['customer_notes_save_template_readback'] = True
        self.report["checks"]["chinese_qt_dialog_text"] = True
        self.report["file_dialog_override"] = "预选隔离XLSX路径，真实按钮、导入确认、解析及存储"
        self.capture(window, "customer-management-960.png")
        window.todo_service.delete(window.todo_items[0]["id"])
        window.load_todos()
        window.customer.clear()
        window.refresh()
        window.navigate(window.PAGE_QUERY)
        self.await_idle(self.compact)

    def compact(self):
        window = self.window
        self.capture(window, "main-960.png")
        self.report["compact_actual"] = [window.width(), window.height()]
        self.report["checks"]["compact_layout"] = window.table.height() >= 70 and window.search_button.isVisible()
        self.report["checks"]["quote_query_remains_start_page"] = window.pages.currentIndex() == window.PAGE_QUERY
        QTest.mouseClick(window.settings_nav, Qt.MouseButton.LeftButton)
        assert window.pages.currentIndex() == window.PAGE_SETTINGS and window.settings_nav.isChecked()
        assert window.storage_label.geometry().right() < window.settings_nav.geometry().left()
        assert abs(window.storage_label.geometry().center().y() - window.settings_nav.geometry().center().y()) <= 1
        cloud_text_width = window.storage_label.fontMetrics().horizontalAdvance("● Supabase 云数据库")
        assert window.storage_label.width() >= cloud_text_width, "侧栏需要容纳完整云数据库文字"
        assert window.settings_nav.accessibleName() == "设置"
        self.report["checks"]["settings_next_to_storage_at_960"] = True
        window.navigate(window.PAGE_DATA)
        assert window.pages.currentIndex() == window.PAGE_SETTINGS and window.settings_nav.isChecked()
        assert window.settings_tabs.currentIndex() == 0
        window.navigate(window.PAGE_TODO)
        assert window.todo_table.rowCount() == 0
        QTest.mouseClick(window.todo_new_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        dialog.title_field.setText("确认改性材料送样计划")
        dialog.related_field.setText("隔离主机厂项目")
        dialog.due_enabled.setChecked(True)
        dialog.due_date.setDate(QDate(2026, 10, 31))
        dialog.priority.setCurrentIndex(dialog.priority.findData("high"))
        dialog.notes_field.setPlainText("候选程序本地验收")
        QTest.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
        assert window.todo_table.rowCount() == 1
        assert window.todo_table.item(0, 1).text() == "确认改性材料送样计划"
        assert window.todo_delete_button.mapTo(window, window.todo_delete_button.rect().bottomRight()).x() < window.width()
        window.todo_search.setText("不存在")
        assert window.todo_table.rowCount() == 0
        window.todo_search.clear()
        window.todo_table.selectRow(0)
        QTest.mouseClick(window.todo_complete_button, Qt.MouseButton.LeftButton)
        assert window.todo_items[0]["completed"]
        window.todo_status_filter.setCurrentIndex(window.todo_status_filter.findData("completed"))
        assert window.todo_table.rowCount() == 1 and window.todo_edit_button.isEnabled()
        QTest.mouseClick(window.todo_edit_button, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        dialog.title_field.setText("已确认送样日期")
        QTest.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
        window.load_todos()
        item = window.todo_service.list_items()[0]
        assert item["title"] == "已确认送样日期" and item["completed"] and item["due_date"] == "2026-10-31"
        self.report["checks"]["todo_create_filter_complete_edit_persist"] = True
        window.navigate(window.PAGE_PROJECT_PROGRESS)
        self.await_idle(self.begin_custom_project)

    def begin_custom_project(self):
        window = self.window
        assert window.project_progress_table.rowCount() == 0
        QTest.mouseClick(window.project_progress_new, Qt.MouseButton.LeftButton)
        dialog = next(iter(window.dialogs))
        dialog.controls["industry"].setText("汽车零部件")
        dialog.controls["customer_name"].setText("隔离自定义项目客户")
        dialog.controls["material"].setText("PP-GF30 改性料")
        dialog.controls["recommended_grade"].setText("QA-30")
        dialog.controls["product_name"].setText("内饰支架")
        dialog.customer_type.setCurrentIndex(dialog.customer_type.findData("oem"))
        dialog.customer_value.setEditText("区域重点客户")
        dialog.material_value.setEditText("耐候增强改性")
        dialog.stage.setEditText("客户联合试制")
        dialog.competition.setEditText("新进入者竞争")
        choices = (dialog.customer_value, dialog.material_value, dialog.stage, dialog.competition)
        assert all(control.isEditable() for control in choices)
        assert all("分" not in control.itemText(index)
                   for control in choices for index in range(control.count()))
        save = dialog.findChild(QPushButton, "SaveProjectProgress")
        if save is None:
            raise AssertionError("项目保存按钮未找到")
        QTest.mouseClick(save, Qt.MouseButton.LeftButton)
        self.await_idle(self.custom_project_saved)

    def custom_project_saved(self):
        window = self.window
        assert window.project_progress_table.rowCount() == 1
        assert window.project_progress_table.item(0, 5).text() == "客户联合试制"
        assert window.project_progress_table.item(0, 6).text() == "D"
        record = window.context.store.project_progress_list()["projects"][0]
        scored = score_project(validate_project(record))
        assert [scored[key] for key in (
            "stage_score", "customer_score", "material_score", "competition_score")] == [0, 0, 0, 0]
        custom_fields = ("custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition")
        assert [record[key] for key in custom_fields] == [
            "客户联合试制", "区域重点客户", "耐候增强改性", "新进入者竞争",
        ]
        self.report["checks"]["custom_values_persist_and_score_zero"] = True
        window.navigate(window.PAGE_QUERY)
        assert window.pages.currentIndex() == window.PAGE_QUERY
        window.resize(1280, 800)
        self.shell()

    def shell(self):
        window = self.window
        window.navigate(window.PAGE_DATA)
        assert window.pages.currentIndex() == window.PAGE_SETTINGS and window.settings_nav.isChecked()
        assert window.settings_tabs.currentIndex() == 0
        window.close()
        assert not window.isVisible() and not window._closing and not window.context.closing
        self.report["checks"]["close_hides_without_shutdown"] = True
        QTimer.singleShot(100, self, lambda: self.safe(self.restore))

    def restore(self):
        self.tray.show_action.trigger()
        assert self.window.isVisible() and self.window.pages.currentIndex() == self.window.PAGE_DATA, "托盘恢复后应保留关闭前的数据页"
        self.report["checks"]["tray_restore_preserves_page"] = True
        self.window.showMaximized()
        QTimer.singleShot(100, self, lambda: self.safe(self.maximized))

    def maximized(self):
        self.window.close()
        self.tray.activated(QSystemTrayIcon.ActivationReason.DoubleClick)
        assert self.window.isVisible() and self.window.isMaximized()
        self.report["checks"]["tray_menu_and_double_click_restore"] = True
        self.window.showNormal()
        self.window.resize(1280, 800)
        QTest.mouseClick(self.window.settings_nav, Qt.MouseButton.LeftButton)
        QTimer.singleShot(150, self, lambda: self.safe(self.finish))

    def finish(self):
        assert all(self.report["checks"].values())
        self.capture(self.window, "settings-tray-1280.png")
        self.tray.quit_action.trigger()
        assert self.window._exit_requested and self.window._ready_to_close
        self.report["checks"]["explicit_exit_requested"] = True
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()

    def fail(self, message):
        if self.finished:
            return
        self.report["status"] = "failed"
        self.report["error"] = str(message)
        self.exit_code = 2
        self.write_report()
        self.finished = True
        self.timeout.stop()
        for dialog in tuple(self.window.dialogs):
            dialog.accept()
        self.window.request_exit()
