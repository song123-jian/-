import re
import threading
from decimal import Decimal
from unittest.mock import patch

import pytest
from conftest import record
from pdf_factory import quotation_pdf
from PySide6.QtCore import QDate, Qt, QTimer
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMessageBox,
    QSizePolicy,
    QTableWidgetItem,
)
from shiboken6 import isValid

from services.backend_service import BackendService
from ui.dialogs import BackendDialog, HistoryDialog, ImportPreviewDialog, PdfImportOptionsDialog, QuoteDialog
from ui.main_window import MainWindow
from ui.project_progress_dialog import ProjectProgressDialog
from ui.quote_table_model import ACTION_COLUMN, PRICE_COLUMN, ROW_ROLE
from ui.theme_tokens import COLORS, apply_theme


@pytest.fixture(autouse=True)
def discard_unfinished_forms(monkeypatch):
    # Test teardown must never wait for a human in a modal confirmation.
    monkeypatch.setattr(QMessageBox, "question", lambda *args, **kwargs: QMessageBox.StandardButton.Discard)


@pytest.fixture
def window(qtbot, context):
    apply_theme(QApplication.instance())
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    yield window
    for dialog in tuple(window.dialogs):
        dialog.accept()
    if isValid(window) and window.isVisible():
        window.close()
        qtbot.waitUntil(lambda: not isValid(window) or not window.isVisible(), timeout=10000)


def test_stat_card_font_sizes_follow_theme_roles(qtbot, window):
    window.resize(1000, 700)
    qtbot.waitUntil(lambda: window.card_values[0].property("role") == "statCompact", timeout=3000)
    assert [number.font().pixelSize() for number in window.card_values] == [22, 22, 22, 18]

    window.resize(1200, 700)
    qtbot.waitUntil(lambda: window.card_values[0].property("role") == "number", timeout=3000)
    assert [number.font().pixelSize() for number in window.card_values] == [26, 26, 26, 18]


def test_customer_search_enter_and_empty_result(qtbot, window):
    assert window.model.rowCount() == 41
    window.customer.setText("金华")
    qtbot.keyClick(window.customer, Qt.Key.Key_Return)
    qtbot.waitUntil(lambda: window.model.rowCount() == 16, timeout=5000)
    window.customer.setText("完全不存在的客户")
    qtbot.keyClick(window.customer, Qt.Key.Key_Return)
    qtbot.waitUntil(lambda: window.model.rowCount() == 0, timeout=5000)
    assert window.empty_label.isVisible()
    assert "没有找到匹配报价" in window.empty_label.text()
    assert window.customer.text() == "完全不存在的客户"


def test_numeric_sort_retains_quote_id(qtbot, window):
    window.proxy.sort(PRICE_COLUMN, Qt.SortOrder.AscendingOrder)
    prices = [Decimal(window.proxy.index(index, PRICE_COLUMN).data(ROW_ROLE)["price"]) for index in range(window.proxy.rowCount())]
    assert prices == sorted(prices)
    target = window.proxy.index(0, 0).data(ROW_ROLE)
    window.table.selectRow(0)
    window.edit_selected()
    dialog = next(iter(window.dialogs))
    assert dialog.row["id"] == target["id"]
    assert dialog.fields["customer"].isReadOnly()
    dialog.accept()


def test_quote_dialog_exact_save_field_error_and_dirty_close(qtbot, window, context):
    dialog = QuoteDialog(window.prices, window.tasks, context.storage_generation, parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.activateWindow()
    qtbot.waitUntil(dialog.isActiveWindow, timeout=3000)
    for key, value in record(price="9.734513").items():
        field = dialog.fields[key]
        if key == "tax_type":
            field.setCurrentText(value)
        elif key == "effective_date":
            field.setDate(QDate.fromString(value, "yyyy-MM-dd"))
        elif key == "note":
            field.setPlainText(value)
        else:
            field.setText(value)
    with patch.object(QMessageBox, "question", return_value=QMessageBox.StandardButton.Cancel):
        dialog.reject()
        assert dialog.isVisible()
    dialog.fields["price"].setText("0")
    qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    assert dialog.errors["price"].isVisible()
    assert dialog.fields["price"].hasFocus()
    dialog.fields["price"].setText("9.734513")
    with qtbot.waitSignal(dialog.saved, timeout=5000):
        qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    row = context.store.list({"customer": "QA隔离客户"})["items"][0]
    assert row["price"] == "9.734513"
    assert dialog.isVisible() and dialog.row["id"] == row["id"]
    dialog.accept()


def test_history_one_point_and_full_precision(qtbot, window, context):
    first = context.store.add(record(price="9.734513"))
    items = context.store.history(first["id"])["items"]
    dialog = HistoryDialog(items, window)
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.waitUntil(lambda: len(dialog.trend.points) == 1, timeout=3000)
    assert dialog.model.index(0, 1).data() == "9.734513"
    dialog.table.selectRow(0)
    dialog.copy_row()
    assert "9.734513" in QGuiApplication.clipboard().text()
    dialog.accept()


def test_import_errors_disable_confirm(qtbot, window, context, tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("客户,牌号,价格,更新日期\nQA,PP,0,2026-10-09\n", encoding="utf-8")
    preview = window.prices.preview_import(path, context.storage_generation)
    dialog = ImportPreviewDialog(preview, window.prices, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    assert not dialog.commit.isEnabled()
    assert dialog.notice.isVisible()
    dialog.reject()


def test_old_query_cannot_overwrite_latest(qtbot, window, context):
    old_started, release = threading.Event(), threading.Event()
    original = context.store.list

    def slow(filters=None):
        if filters and filters.get("customer") == "金华":
            old_started.set()
            assert release.wait(5)
        return original(filters)

    with patch.object(context.store, "list", side_effect=slow):
        window.customer.setText("金华")
        window.query()
        qtbot.waitUntil(old_started.is_set, timeout=3000)
        window.customer.setText("不存在")
        window.query()
        qtbot.waitUntil(lambda: window.model.rowCount() == 0, timeout=3000)
        release.set()
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.model.rowCount() == 0


def test_old_generation_result_discarded(qtbot, window, context):
    generation = context.storage_generation
    release, started = threading.Event(), threading.Event()
    results = []

    def delayed():
        started.set()
        assert release.wait(5)
        return {"storage_generation": generation}

    window.tasks.submit(delayed, results.append, lambda exc: pytest.fail(str(exc)), generation=generation)
    qtbot.waitUntil(started.is_set, timeout=3000)
    BackendService(context).switch_backend("sqlite", generation=generation)
    release.set()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert not results


def test_background_read_keeps_ui_responsive_and_close_waits_write(qtbot, window, context):
    release, started = threading.Event(), threading.Event()
    heartbeats = []
    timer = QTimer()
    timer.setInterval(15)
    timer.timeout.connect(lambda: heartbeats.append(1))
    timer.start()

    def delayed_write():
        started.set()
        assert release.wait(5)
        return window.prices.add_quote({**record(), "storage_generation": context.storage_generation})

    window.tasks.submit(delayed_write, lambda value: None, lambda exc: pytest.fail(str(exc)), generation=context.storage_generation, write=True)
    qtbot.waitUntil(started.is_set, timeout=3000)
    qtbot.waitUntil(lambda: len(heartbeats) >= 4, timeout=1500)
    window.close()
    assert window.isVisible()
    assert window.tasks.closing
    release.set()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)
    timer.stop()
    assert context.store.list({"customer": "QA隔离客户"})["items"]


def test_keyboard_shortcuts_and_compact_layout(qtbot, window):
    window.resize(960, 640)
    window.activateWindow()
    qtbot.waitUntil(window.isActiveWindow, timeout=3000)
    qtbot.keyClick(window, Qt.Key.Key_F, Qt.KeyboardModifier.ControlModifier)
    assert window.customer.hasFocus()
    qtbot.keyClick(window, Qt.Key.Key_N, Qt.KeyboardModifier.ControlModifier)
    qtbot.waitUntil(lambda: bool(window.dialogs), timeout=3000)
    dialog = next(iter(window.dialogs))
    qtbot.keyClick(dialog, Qt.Key.Key_Escape)
    qtbot.waitUntil(lambda: not dialog.isVisible(), timeout=3000)
    assert window.cards_grid.rowCount() == 1
    assert window.table.viewport().height() >= 120
    assert window.table.height() > 70
    assert window.search_button.isVisible()
    assert COLORS["g700"] == "#2f6b54"


def test_storage_and_settings_controls_are_vertically_centered(qtbot, window):
    window.resize(960, 640)
    qtbot.wait(100)
    assert window.settings_nav.height() >= 38
    assert window.customers.height() >= 50
    label_center = window.storage_label.geometry().center().y()
    settings_center = window.settings_nav.geometry().center().y()
    assert abs(label_center - settings_center) <= 1


def test_project_progress_is_a_full_page_ledger_without_the_removed_plan_panel(qtbot, window):
    window.navigate(window.PAGE_PROJECT_PROGRESS)
    ledger = window.project_progress_ledger
    table = window.project_progress_table
    assert ledger.isVisible()
    assert window.project_nav.isChecked()
    assert not hasattr(window, "project_progress_panel")
    assert not any("改性材料项目进度与最优方案" in widget.text()
                   for widget in window.project_body.findChildren(QLabel))
    assert ledger.parentWidget() is window.project_body
    assert ledger.sizePolicy().verticalPolicy() == QSizePolicy.Policy.Expanding
    assert table.maximumHeight() == 16777215
    assert table.sizePolicy().verticalPolicy() == QSizePolicy.Policy.Expanding
    assert table.horizontalScrollBarPolicy() == Qt.ScrollBarPolicy.ScrollBarAlwaysOff
    assert table.wordWrap()
    assert all(table.horizontalHeader().sectionResizeMode(column) == QHeaderView.ResizeMode.Stretch
               for column in range(table.columnCount()))
    window.resize(960, 640)
    qtbot.wait(50)
    assert table.horizontalScrollBar().maximum() == 0
    window.navigate(window.PAGE_DATA)
    assert window.settings_nav.isChecked() and window.settings_tabs.currentIndex() == 0
    assert not [widget for widget in window.data_body.findChildren(QFrame) if widget.property("role") == "projectProgress"]


def test_project_progress_table_wraps_long_content_without_horizontal_overflow(qtbot, window):
    window.navigate(window.PAGE_PROJECT_PROGRESS)
    qtbot.waitUntil(lambda: window.project_progress_status.text() == "0 个项目", timeout=5000)
    table = window.project_progress_table
    table.setRowCount(1)
    values = (
        "长文本客户名称",
        "汽车零部件行业",
        "汽车零部件主机厂",
        "长玻纤增强阻燃改性材料",
        "JL-PA66-GF30-FR",
        "测试 / 认证",
        "B",
        "完成样件确认、安排第三方测试、补齐认证资料并在客户评审后确认下一批送样时间",
        "2026-12-31",
    )
    for column, value in enumerate(values):
        table.setItem(0, column, QTableWidgetItem(value))
    table.resizeRowsToContents()
    qtbot.wait(50)

    assert table.horizontalScrollBar().maximum() == 0
    assert table.rowHeight(0) > table.verticalHeader().defaultSectionSize()
    assert table.item(0, 7).text() == values[7]


def test_customer_management_precedes_todo_and_quote_query_remains_the_start_page(window):
    assert [control.text() for control in window.primary_navigation] == ["客户管理", "待办事项", "报价查询", "项目进度"]
    assert window.pages.count() == 5
    assert window.todo_nav.isCheckable()
    assert window.customer_nav.isCheckable()
    assert window.pages.currentIndex() == window.PAGE_QUERY
    window.navigate(window.PAGE_TODO)
    assert window.todo_nav.isChecked()
    assert window.todo_table.isVisible()


def test_sidebar_navigation_opens_its_own_page(qtbot, window):
    entries = ((window.customer_nav, window.PAGE_CUSTOMERS, window.customer_profiles_page),
               (window.todo_nav, window.PAGE_TODO, window.todo_table),
               (window.query_nav, window.PAGE_QUERY, window.query_page),
               (window.project_nav, window.PAGE_PROJECT_PROGRESS, window.project_progress_table),
               (window.settings_nav, window.PAGE_SETTINGS, window.settings_page))
    for button, page_index, page in entries:
        qtbot.mouseClick(button, Qt.MouseButton.LeftButton)
        assert window.pages.currentIndex() == page_index
        assert page.isVisible()
        assert button.isChecked()
        assert sum(control.isChecked() for control in (*window.primary_navigation, window.settings_nav)) == 1
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    window.focus_search()
    assert window.pages.currentIndex() == window.PAGE_QUERY and window.query_nav.isChecked()


def test_customer_profile_accepts_blank_fields_and_manual_edits(qtbot, window):
    assert window.customer_profile_table.columnCount() == 6
    assert window.customer_profile_table.horizontalHeaderItem(5).text() == "备注"
    window.navigate(window.PAGE_CUSTOMERS)
    qtbot.waitUntil(lambda: window.customer_profile_status.text() == "0 位客户", timeout=5000)

    qtbot.mouseClick(window.profile_new_button, Qt.MouseButton.LeftButton)
    dialog = next(iter(window.dialogs))
    assert all(not field.text() for field in (dialog.name, dialog.contact, dialog.phone, dialog.industry))
    assert not dialog.address.toPlainText()
    qtbot.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: len(window.customer_profiles) == 1, timeout=5000)
    profile = window.customer_profiles[0]
    assert all(profile[field] == "" for field in ("name", "contact", "phone", "industry", "address"))

    window.customer_profile_table.selectRow(0)
    qtbot.mouseClick(window.profile_edit_button, Qt.MouseButton.LeftButton)
    dialog = next(iter(window.dialogs))
    dialog.name.setText("华东汽车部件")
    dialog.contact.setText("王工")
    dialog.industry.setText("汽车零部件")
    dialog.notes.setPlainText("需要跟踪试样结果")
    qtbot.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: window.customer_profiles[0]["name"] == "华东汽车部件", timeout=5000)
    assert window.customer_profiles[0]["contact"] == "王工"
    assert window.customer_profiles[0]["notes"] == "需要跟踪试样结果"
    assert window.customer_profile_table.horizontalScrollBar().maximum() == 0
    assert window.customer_profiles[0]["phone"] == window.customer_profiles[0]["address"] == ""


def test_customer_links_prefill_project_quote_and_todo_with_manual_overrides(qtbot, window):
    profile = window.customer_profile_service.save_profile(
        {"name": "华东汽车部件", "industry": "汽车零部件"}, window.context.storage_generation)
    window.navigate(window.PAGE_CUSTOMERS)
    qtbot.waitUntil(lambda: len(window.customer_profiles) == 1, timeout=5000)
    window.customer_profile_table.selectRow(0)
    qtbot.mouseClick(window.profile_project_button, Qt.MouseButton.LeftButton)
    dialog = next(iter(window.dialogs))
    assert dialog.controls["customer_name"].text() == profile["name"]
    assert dialog.controls["industry"].text() == profile["industry"]
    dialog.controls["customer_name"].setText("手动客户")
    assert dialog.controls["customer_name"].text() == "手动客户"
    dialog.accept()
    qtbot.mouseClick(window.profile_todo_button, Qt.MouseButton.LeftButton)
    dialog = next(iter(window.dialogs))
    assert dialog.customer_field.currentData() == profile["profile_id"]
    dialog.title_field.setText("等待试样反馈")
    dialog.status_field.setCurrentIndex(dialog.status_field.findData("waiting"))
    qtbot.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
    assert window.todo_service.list_items()[0]["status"] == "waiting"
    assert window.todo_service.list_items()[0]["customer_id"] == profile["profile_id"]
    qtbot.mouseClick(window.profile_quote_button, Qt.MouseButton.LeftButton)
    assert window.pages.currentIndex() == window.PAGE_QUERY
    assert window.customer.text() == profile["name"]
    window.new_quote()
    dialog = next(iter(window.dialogs))
    assert dialog.fields["customer"].text() == profile["name"]
    dialog.accept()
    updated = window.customer_profile_service.save_profile({**profile, "name": "更新客户名称"}, window.context.storage_generation)
    window.customer_profiles_loaded([updated])
    assert window.todo_items[0]["customer_name"] == updated["name"]


def test_todo_status_priority_filters_and_compact_toolbars(qtbot, window):
    window.todo_service.create({"title": "等待反馈", "status": "waiting", "priority": "high"})
    window.todo_service.create({"title": "处理中", "status": "in_progress"})
    window.navigate(window.PAGE_TODO)
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    window.todo_status_filter.setCurrentIndex(window.todo_status_filter.findData("waiting"))
    assert window.todo_table.rowCount() == 1 and window.todo_table.item(0, 0).text() == "等待反馈"
    window.todo_priority_filter.setCurrentIndex(window.todo_priority_filter.findData("low"))
    assert window.todo_table.rowCount() == 0
    window.resize(960, 640)
    qtbot.wait(50)
    for page, button in ((window.PAGE_TODO, window.todo_delete_button),
                         (window.PAGE_CUSTOMERS, window.profile_template_button)):
        window.navigate(page)
        qtbot.wait(50)
        assert window.width() == 960
        assert button.mapTo(window, button.rect().bottomRight()).x() < window.width()


def test_todo_add_filter_complete_edit_and_delete_flow(qtbot, window, monkeypatch):
    window.navigate(window.PAGE_TODO)
    qtbot.waitUntil(lambda: window.todo_status_label.text().startswith("0 项未完成"), timeout=5000)

    qtbot.mouseClick(window.todo_new_button, Qt.MouseButton.LeftButton)
    dialog = next(iter(window.dialogs))
    dialog.title_field.setText("确认改性材料送样计划")
    dialog.related_field.setText("汽车主机厂项目")
    dialog.due_enabled.setChecked(True)
    dialog.due_date.setDate(QDate(2026, 10, 31))
    dialog.priority.setCurrentIndex(dialog.priority.findData("high"))
    dialog.notes_field.setPlainText("确认样件数量")
    qtbot.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: window.todo_table.rowCount() == 1, timeout=5000)
    assert window.todo_table.item(0, 1).text() == "确认改性材料送样计划"
    assert window.todo_table.item(0, 4).text() == "汽车主机厂项目"
    assert window.todo_table.item(0, 5).text() == "2026-10-31"
    assert window.todo_table.item(0, 6).text() == "高"

    window.todo_search.setText("送样")
    assert window.todo_table.rowCount() == 1
    window.todo_search.setText("不存在")
    assert window.todo_table.rowCount() == 0
    window.todo_search.clear()
    window.todo_status_filter.setCurrentIndex(window.todo_status_filter.findData("open"))
    window.todo_table.selectRow(0)
    qtbot.mouseClick(window.todo_complete_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: window.todo_items[0]["completed"], timeout=5000)
    window.todo_status_filter.setCurrentIndex(window.todo_status_filter.findData("completed"))
    assert window.todo_table.rowCount() == 1

    qtbot.mouseClick(window.todo_edit_button, Qt.MouseButton.LeftButton)
    dialog = next(iter(window.dialogs))
    dialog.title_field.setText("已确认送样日期")
    qtbot.mouseClick(dialog.save_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: window.todo_items[0]["title"] == "已确认送样日期", timeout=5000)
    window.load_todos()
    qtbot.waitUntil(lambda: window.todo_items[0]["title"] == "已确认送样日期", timeout=5000)

    def confirm_delete(prompt):
        next(button for button in prompt.buttons() if button.text() == "删除").click()
        return 0

    monkeypatch.setattr(QMessageBox, "exec", confirm_delete)
    window.todo_table.selectRow(0)
    qtbot.mouseClick(window.todo_delete_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: window.todo_items == [], timeout=5000)


def test_project_progress_ledger_creates_and_scores_a_user_entered_project(qtbot, window):
    window.navigate(window.PAGE_PROJECT_PROGRESS)
    qtbot.waitUntil(lambda: window.project_progress_status.text() == "0 个项目", timeout=5000)
    assert window.project_progress_table.rowCount() == 0
    assert "暂无项目记录" not in [widget.text() for widget in window.project_body.findChildren(QLabel)]
    assert hasattr(window, "project_progress_toolbar_buttons"), "项目进度模板导入/导出工具栏未提供"
    assert [control.text() for control in window.project_progress_toolbar_buttons] == ["下载模板", "导入项目", "导出项目", "刷新", "编辑", "新增项目"]
    assert [window.project_progress_table.horizontalHeaderItem(column).text()
            for column in range(window.project_progress_table.columnCount())] == [
                "客户", "行业", "客户类型", "材料", "推荐牌号", "阶段", "档位", "下一步动作", "时间节点",
            ]

    qtbot.mouseClick(window.project_progress_new, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: bool(window.dialogs), timeout=3000)
    dialog = next(iter(window.dialogs))
    dialog.controls["industry"].setText("汽车零部件")
    dialog.controls["customer_name"].setText("Qt受控测试客户")
    dialog.controls["material"].setText("PP-GF30 改性料")
    dialog.controls["recommended_grade"].setText("JL-30")
    dialog.controls["product_name"].setText("内饰支架")
    dialog.controls["next_action"].setText("确认送样计划")
    dialog.customer_type.setCurrentIndex(dialog.customer_type.findData("oem"))
    dialog.material_value.setCurrentIndex(dialog.material_value.findData("special"))
    dialog.stage.setCurrentIndex(dialog.stage.findData(2))
    dialog.customer_value.setCurrentIndex(dialog.customer_value.findData("oem_t1_important"))
    dialog.competition.setCurrentIndex(dialog.competition.findData("open"))
    dialog.submit()

    qtbot.waitUntil(lambda: window.project_progress_status.text() == "1 个项目", timeout=7000)
    assert window.project_progress_table.rowCount() == 1
    assert window.project_progress_table.item(0, 0).text() == "Qt受控测试客户"
    assert window.project_progress_table.item(0, 6).text() == "B"
    assert window.project_progress_table.item(0, 7).flags() & Qt.ItemFlag.ItemIsEditable
    assert window.context.store.project_progress_list()["projects"][0]["revision"] == 1
    customer_item = window.project_progress_table.item(0, 0)
    assert window.project_progress_table.isEnabled()
    assert customer_item.flags() & Qt.ItemFlag.ItemIsEditable
    window.project_progress_table.setCurrentItem(customer_item)
    window.project_progress_table.setFocus()
    qtbot.keyClick(window.project_progress_table, Qt.Key.Key_F2)
    qtbot.waitUntil(
        lambda: any(editor.isVisible() for editor in window.project_progress_table.findChildren(QLineEdit)),
        timeout=3000,
    )
    editor = next(editor for editor in window.project_progress_table.findChildren(QLineEdit) if editor.isVisible())
    editor.setText("Qt受控测试客户手动修改")
    qtbot.keyClick(editor, Qt.Key.Key_Return)
    qtbot.waitUntil(
        lambda: window.context.store.project_progress_list()["projects"][0]["customer_name"] == "Qt受控测试客户手动修改",
        timeout=7000,
    )
    assert window.context.store.project_progress_list()["projects"][0]["revision"] == 2
    window.edit_project_progress(0)
    qtbot.waitUntil(lambda: bool(window.dialogs), timeout=3000)
    edit_dialog = next(iter(window.dialogs))
    assert edit_dialog.customer_type.currentData() == "oem"
    assert edit_dialog.customer_value.currentData() == "oem_t1_important"
    assert edit_dialog.material_value.currentData() == "special"
    assert edit_dialog.stage.currentData() == 2
    assert edit_dialog.competition.currentData() == "open"
    edit_dialog.reject()


def test_project_progress_add_keeps_table_scroll_position(qtbot, window):
    from services.project_progress_service import validate_project

    base = {
        "industry": "汽车零部件", "customer_type": "oem", "customer_value": "oem_t1_important",
        "material": "PP-GF30 改性料", "recommended_grade": "JL-30", "material_value": "special",
        "color": "", "competitor": "", "product_name": "内饰支架", "stage_code": 2,
        "competition": "open", "next_action": "确认送样计划", "milestone_date": "", "notes": "",
    }
    for index in range(30):
        record = validate_project({**base, "customer_name": f"滚动测试客户{index:02d}"})
        window.context.store.save_project_progress({**record, "_new_project": True})

    window.navigate(window.PAGE_PROJECT_PROGRESS)
    window.load_project_progress()
    qtbot.waitUntil(lambda: window.project_progress_table.rowCount() == 30, timeout=7000)
    table_scroll = window.project_progress_table.verticalScrollBar()
    assert table_scroll.maximum() > 0
    table_scroll.setValue(table_scroll.maximum())
    scroll_position = table_scroll.value()

    new_project = validate_project({**base, "customer_name": "新增滚动测试客户"})
    window.save_project_progress(new_project)
    qtbot.waitUntil(
        lambda: window.project_progress_table.rowCount() == 31
        and window.project_progress_status.text() == "31 个项目",
        timeout=7000,
    )
    qtbot.waitUntil(lambda: table_scroll.value() == scroll_position, timeout=3000)


def test_project_progress_dialog_starts_with_unselected_scoring_categories(qtbot):
    dialog = ProjectProgressDialog()
    qtbot.addWidget(dialog)
    assert dialog.customer_type.currentData() is None
    assert dialog.customer_value.currentData() is None
    assert dialog.material_value.currentData() is None
    assert dialog.stage.currentData() is None
    assert dialog.competition.currentData() is None


def test_project_progress_dialog_allows_custom_categories_without_score_labels(qtbot):
    dialog = ProjectProgressDialog()
    qtbot.addWidget(dialog)
    fields = (dialog.customer_value, dialog.material_value, dialog.stage, dialog.competition)
    assert all(control.isEditable() for control in fields)
    assert all("分" not in control.itemText(index)
               for control in fields for index in range(control.count()))

    dialog.controls["industry"].setText("汽车零部件")
    dialog.controls["customer_name"].setText("自定义项目客户")
    dialog.controls["material"].setText("PP-GF30")
    dialog.customer_type.setCurrentIndex(dialog.customer_type.findData("oem"))
    dialog.customer_value.setEditText("区域重点客户")
    dialog.material_value.setEditText("耐候增强改性")
    dialog.stage.setEditText("客户联合试制")
    dialog.competition.setEditText("新进入者竞争")
    saved = []
    dialog.saved.connect(saved.append)
    dialog.submit()

    assert len(saved) == 1
    assert saved[0]["custom_customer_value"] == "区域重点客户"
    assert saved[0]["custom_material_value"] == "耐候增强改性"
    assert saved[0]["custom_stage_label"] == "客户联合试制"
    assert saved[0]["custom_competition"] == "新进入者竞争"


def test_project_progress_dialog_displays_missing_cloud_date_as_blank(qtbot):
    dialog = ProjectProgressDialog(record={"milestone_date": None})
    qtbot.addWidget(dialog)
    assert dialog.controls["milestone_date"].text() == ""


def test_backend_failure_restores_controls(qtbot, window):
    dialog = BackendDialog(window.backends, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.backend.setCurrentIndex(1)
    dialog.key.setText("anon-is-not-a-backend-key")
    qtbot.mouseClick(dialog.test, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.busy, timeout=5000)
    assert dialog.test.isEnabled() and dialog.save.isEnabled()
    assert dialog.notice.isVisible()
    assert "Secret" in dialog.notice.text.text()
    dialog.accept()


def test_native_import_confirmation_commits_and_refreshes(qtbot, window, tmp_path):
    path = tmp_path / "new.csv"
    path.write_text("客户,牌号,价格,更新日期\nQt导入客户,PP,9.734513,2026-10-09\n", encoding="utf-8")
    preview = window.prices.preview_import(path, window.context.storage_generation)
    dialog = ImportPreviewDialog(preview, window.prices, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    with qtbot.waitSignal(dialog.imported, timeout=5000) as signal:
        qtbot.mouseClick(dialog.commit, Qt.MouseButton.LeftButton)
        assert not dialog.commit.isEnabled()
    assert signal.args[0]["added"] == 1
    assert window.context.store.list({"customer": "Qt导入客户"})["items"][0]["price"] == "9.734513"


def test_native_backend_switch_updates_generation(qtbot, window):
    generation = window.context.storage_generation
    dialog = BackendDialog(window.backends, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    with qtbot.waitSignal(dialog.switched, timeout=5000):
        qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    assert window.context.storage_generation != generation
    assert not dialog.isVisible()


def test_old_form_failure_restores_submit_without_writing(qtbot, window):
    row = window.model.items[0]
    generation = window.context.storage_generation
    dialog = QuoteDialog(window.prices, window.tasks, generation, row=row, parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.fields["price"].setText("9.734513")
    dialog.fields["reason"].setText("旧表单测试")
    BackendService(window.context).switch_backend("sqlite", generation=generation)
    qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.busy, timeout=5000)
    assert dialog.save.isEnabled()
    assert "数据库已切换" in dialog.notice.text.text()
    assert len(window.context.store.history(row["id"])["items"]) == 1
    dialog.accept()


def test_delegate_history_click_uses_id_after_sort(qtbot, window):
    window.resize(1450, 900)
    window.proxy.sort(PRICE_COLUMN, Qt.SortOrder.DescendingOrder)
    index = window.proxy.index(0, ACTION_COLUMN)
    row_id = index.data(ROW_ROLE)["id"]
    window.table.scrollTo(index)
    qtbot.wait(50)
    rect = window.table.visualRect(index)
    first, _ = window.delegate.action_rects(rect)
    with qtbot.waitSignal(window.delegate.historyRequested, timeout=2000) as signal:
        qtbot.mouseClick(window.table.viewport(), Qt.MouseButton.LeftButton, pos=first.center())
    assert signal.args[0] == row_id
    qtbot.waitUntil(lambda: bool(window.dialogs), timeout=5000)
    next(iter(window.dialogs)).accept()


def test_unexpected_worker_failure_recovers_busy_state(qtbot, window, caplog):
    errors = []

    def failure():
        raise RuntimeError("isolated QA failure")

    window.tasks.submit(failure, lambda _: pytest.fail("unexpected success"), errors.append, write=True)
    qtbot.waitUntil(lambda: bool(errors) and not window.tasks.jobs, timeout=5000)
    assert "程序数据目录中的 app.log" in str(errors[0])
    assert "Background task failed (RuntimeError" in caplog.text
    assert not window.progress.isVisible()


def test_unexpected_worker_log_has_safe_correlation_context(qtbot, window, caplog):
    secret = "isolated-sensitive-error-marker"
    errors = []

    window.tasks.submit(lambda: (_ for _ in ()).throw(RuntimeError(secret)),
                        lambda _: pytest.fail("unexpected success"), errors.append, write=True)
    qtbot.waitUntil(lambda: bool(errors) and not window.tasks.jobs, timeout=5000)

    assert secret not in caplog.text
    assert "phase=write" in caplog.text and "error_code=unexpected_error" in caplog.text
    match = re.search(r"operation_id=([0-9a-f]{16})", caplog.text)
    assert match and match.group(1) in str(errors[0])


def test_network_worker_failure_is_classified_as_network(qtbot, window, caplog):
    from domain import NetworkError

    errors = []
    window.tasks.submit(lambda: (_ for _ in ()).throw(NetworkError("连接失败")),
                        lambda _: pytest.fail("unexpected success"), errors.append)
    qtbot.waitUntil(lambda: bool(errors) and not window.tasks.jobs, timeout=5000)

    assert "error_code=network_error" in caplog.text


@pytest.mark.parametrize("method", ["refresh_quotes", "list_quotes"])
def test_successful_read_retry_clears_previous_error(qtbot, window, monkeypatch, method):
    from domain import NetworkError

    original = getattr(window.prices, method)

    def failed_read(*args):
        raise NetworkError("临时云端读取失败")

    monkeypatch.setattr(window.prices, method, failed_read)
    (window.refresh if method == "refresh_quotes" else window.query)()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.notice.isVisible()
    monkeypatch.setattr(window.prices, method, original)
    (window.refresh if method == "refresh_quotes" else window.query)()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.customer_model.rowCount() == 6
    assert not window.notice.isVisible()


def test_customer_directory_refresh_is_independent_from_quote_refresh(qtbot, window, monkeypatch):
    from domain import NetworkError

    directory = [{"customer_key": "independent-key", "display_name": "独立目录客户", "specs": 3,
                  "records": 3, "revision": 1, "deleted_at": None, "deleted_reason": ""}]

    def failed_quotes(*args):
        raise NetworkError("报价读取暂时失败")

    monkeypatch.setattr(window.prices, "refresh_quotes", failed_quotes)
    monkeypatch.setattr(window.customer_service, "list_customers",
                        lambda status, generation: {"items": directory, "storage_generation": generation})
    window.refresh()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)

    assert window.customer_model.index(1, 0).data(Qt.ItemDataRole.UserRole) == "独立目录客户"
    assert "meta" in window.read_errors


def test_old_customer_directory_result_is_discarded(qtbot, window, monkeypatch):
    started, release = threading.Event(), threading.Event()
    calls = []
    old = [{"customer_key": "old-key", "display_name": "旧目录结果", "specs": 1, "records": 1,
            "revision": 1, "deleted_at": None, "deleted_reason": ""}]
    fresh = [{"customer_key": "fresh-key", "display_name": "新目录结果", "specs": 2, "records": 2,
              "revision": 1, "deleted_at": None, "deleted_reason": ""}]

    def delayed(status, generation):
        calls.append(1)
        if len(calls) == 1:
            started.set()
            release.wait(5)
            return {"items": old, "storage_generation": generation}
        return {"items": fresh, "storage_generation": generation}

    monkeypatch.setattr(window.customer_service, "list_customers", delayed)
    window.load_customer_directory()
    qtbot.waitUntil(started.is_set, timeout=3000)
    window.load_customer_directory()
    qtbot.waitUntil(lambda: window.customer_model.index(1, 0).data(Qt.ItemDataRole.UserRole) == "新目录结果",
                    timeout=5000)
    release.set()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)

    assert window.customer_model.index(1, 0).data(Qt.ItemDataRole.UserRole) == "新目录结果"


def test_query_recovery_preserves_outstanding_metadata_error(qtbot, window, monkeypatch):
    from domain import NetworkError

    original_meta = window.prices.refresh_quotes
    original_query = window.prices.list_quotes

    def failed_read(*args):
        raise NetworkError("临时云端读取失败")

    monkeypatch.setattr(window.prices, "refresh_quotes", failed_read)
    monkeypatch.setattr(window.prices, "list_quotes", failed_read)
    window.refresh()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    monkeypatch.setattr(window.prices, "list_quotes", original_query)
    window.query()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.notice.isVisible()
    assert window.read_errors == {"meta": "临时云端读取失败"}
    monkeypatch.setattr(window.prices, "refresh_quotes", original_meta)
    window.refresh()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert not window.notice.isVisible()


def test_read_recovery_preserves_later_operation_error(qtbot, window):
    from domain import NetworkError

    window.query_failed(NetworkError("临时云端读取失败"))
    window.failed(ValueError("导出文件无法写入"))
    window.query()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.notice.isVisible()
    assert window.notice.text.text() == "导出文件无法写入"
    assert not window.read_errors


def test_pdf_file_picker_to_confirmed_preview_and_native_commit(qtbot, window, context, tmp_path, monkeypatch):
    monkeypatch.setattr("importer.today", lambda: "2026-10-10")
    rows = [["材料名称", "材料规格", "价格", "备注"], ["PA6+GF15 黑色", "PDF-QA-BG3", "9.734513", ""]]
    path = tmp_path / "quotation.pdf"
    path.write_bytes(quotation_pdf([rows], metadata=["客户名称：金华领先塑业有限公司", "日期：2026年9月23日", "本次报价（未税）"]))

    def choose(*args):
        assert "*.pdf" in args[-1]
        return str(path), ""

    monkeypatch.setattr("ui.main_window_file_operations.QFileDialog.getOpenFileName", choose)
    index = next(window.customer_model.index(row, 0) for row in range(window.customer_model.rowCount())
                 if window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) == "金华领先")
    qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton, pos=window.customers.visualRect(index).center())
    window.import_file()
    qtbot.waitUntil(lambda: any(isinstance(dialog, PdfImportOptionsDialog) for dialog in window.dialogs), timeout=5000)
    options = next(dialog for dialog in window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
    assert options.customer.currentText() == "金华领先"
    assert not options.customer.isEnabled()
    assert options.date.text() == "" and options.tax.currentData() == ""
    assert options.split_color.isVisible() and options.split_color.isChecked()
    options.tax.setCurrentText("未税")
    options.date.setText("2026-02-30")
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    assert options.isVisible() and options.notice.isVisible()
    assert len(context.store.all()) == 41
    options.date.clear()
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: any(isinstance(dialog, ImportPreviewDialog) for dialog in window.dialogs), timeout=5000)
    preview = next(dialog for dialog in window.dialogs if isinstance(dialog, ImportPreviewDialog))
    assert (preview.preview["added"], preview.preview["error_count"]) == (1, 0)
    assert preview.table.item(0, 7).text() == "PDF第1页·表1"
    assert len(context.store.all()) == 41
    with qtbot.waitSignal(preview.imported, timeout=5000):
        qtbot.mouseClick(preview.commit, Qt.MouseButton.LeftButton)
    saved = context.store.list({"q": "PDF-QA-BG3"})["items"][0]
    assert (saved["customer"], saved["price"], saved["material"], saved["color"]) == ("金华领先", "9.734513", "PA6+GF15", "黑色")
    assert saved["effective_date"] == "2026-10-10"


def test_selected_customer_csv_merge_commit_and_selection_survives_refresh(qtbot, window, context, tmp_path, monkeypatch):
    customer = window.customer_model.index(1, 0).data(Qt.ItemDataRole.UserRole)
    existing = next(row for row in window.model.items if row["customer"] == customer)
    index = window.customer_model.index(1, 0)
    qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton, pos=window.customers.visualRect(index).center())
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.import_customer == customer
    path = tmp_path / "selected.csv"
    tax_header = "含税价格" if existing["tax_type"] == "含税" else "未税价格" if existing["tax_type"] == "未税" else "价格"
    path.write_text(f"客户,牌号,{tax_header}\n不该创建的客户,{existing['grade']},13.123456\n不该创建的客户,Qt新牌号,12\n", encoding="utf-8")
    monkeypatch.setattr("ui.main_window_file_operations.QFileDialog.getOpenFileName", lambda *args: (str(path), ""))
    window.import_file()
    options = next(dialog for dialog in window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
    assert options.customer.currentText() == customer and not options.customer.isEnabled()
    options.date.setText("2026-10-10")
    options.tax.setCurrentText(existing["tax_type"])
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: any(isinstance(dialog, ImportPreviewDialog) for dialog in window.dialogs), timeout=5000)
    preview = next(dialog for dialog in window.dialogs if isinstance(dialog, ImportPreviewDialog))
    assert (preview.preview["updated"], preview.preview["created"], preview.preview["new_customers"]) == (1, 1, 0)
    assert customer in preview.scope_label.text()
    qtbot.mouseClick(preview.commit, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not window.tasks.jobs and not preview.isVisible(), timeout=5000)
    assert len(context.store.history(existing["id"])["items"]) == 2
    assert not context.store.list({"customer": "不该创建的客户"})["items"]
    assert window.import_customer == customer
    assert window.customers.currentIndex().data(Qt.ItemDataRole.UserRole) == customer


def test_all_customer_import_cannot_fill_customer_from_heading(qtbot, window, context, tmp_path, monkeypatch):
    index = window.customer_model.index(0, 0)
    qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton, pos=window.customers.visualRect(index).center())
    path = tmp_path / "no-client.csv"
    path.write_text("牌号,含税价格\nQt新牌号,12\n", encoding="utf-8")
    monkeypatch.setattr("ui.main_window_file_operations.QFileDialog.getOpenFileName", lambda *args: (str(path), ""))
    window.import_file()
    options = next(dialog for dialog in window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
    assert options.mode == "all" and not options.customer.isEnabled()
    options.date.setText("2026-10-10")
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: any(isinstance(dialog, ImportPreviewDialog) for dialog in window.dialogs), timeout=5000)
    preview = next(dialog for dialog in window.dialogs if isinstance(dialog, ImportPreviewDialog))
    assert not preview.commit.isEnabled() and "客户" in preview.preview["errors"][0]["message"]
    assert len(context.store.all()) == 41
    preview.reject()


@pytest.mark.parametrize("origin", ["PAGE_CUSTOMERS", "PAGE_TODO", "PAGE_QUERY", "PAGE_PROJECT_PROGRESS", "PAGE_SETTINGS"])
@pytest.mark.parametrize("activation", ["click", "keyboard"])
def test_customer_directory_always_opens_quote_results(qtbot, window, context, origin, activation):
    total = len(context.store.all())
    window.navigate(getattr(window, origin))
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    index = window.customer_model.index(1, 0)
    customer = index.data(Qt.ItemDataRole.UserRole)
    assert customer
    if activation == "click":
        qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton,
                         pos=window.customers.visualRect(index).center())
    else:
        window.customers.setCurrentIndex(index)
        window.customers.setFocus()
        qtbot.keyClick(window.customers, Qt.Key.Key_Return)
    assert window.pages.currentIndex() == window.PAGE_QUERY
    assert window.query_nav.isChecked() and not window.customer_nav.isChecked()
    assert window.customer.text() == window.import_customer == customer
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.model.rowCount() > 0 and window.table.isVisible()
    assert all(customer in window.model.index(row, 0).data(ROW_ROLE)["customer"]
               for row in range(window.model.rowCount()))
    window.navigate(window.PAGE_CUSTOMERS)
    all_customers = window.customer_model.index(0, 0)
    qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton,
                     pos=window.customers.visualRect(all_customers).center())
    assert window.pages.currentIndex() == window.PAGE_QUERY
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.customer.text() == window.import_customer == ""
    assert window.model.rowCount() == total and len(context.store.all()) == total


def test_customer_search_cannot_be_used_as_selected_import_target(qtbot, window, monkeypatch):
    window.select_customer(window.customer_model.index(1, 0))
    window.customer.setText("金华")
    assert window.import_customer == ""
    assert not window.customers.currentIndex().isValid()
    picker = []
    monkeypatch.setattr("ui.main_window_file_operations.QFileDialog.getOpenFileName", lambda *args: picker.append(1))
    window.import_file()
    assert not picker and "点击左侧" in window.notice.text.text()


def test_pdf_error_preview_displays_page_and_disables_commit(qtbot, window, context, tmp_path):
    path = tmp_path / "bad.pdf"
    path.write_bytes(quotation_pdf([[["牌号", "价格"], ["PP", "0"]]]))
    preview = window.prices.preview_import(path, context.storage_generation, {"customer": "甲", "effective_date": "2026-09-23"})
    dialog = ImportPreviewDialog(preview, window.prices, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    assert not dialog.commit.isEnabled() and dialog.notice.isVisible()
    from PySide6.QtWidgets import QPlainTextEdit
    assert "PDF第1页·表1 第2行" in dialog.findChild(QPlainTextEdit).toPlainText()
    dialog.reject()
