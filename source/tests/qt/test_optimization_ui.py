"""Real Qt actions and bounded read scheduling, with disposable SQLite data."""
import inspect
import threading

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication
from test_read_optimization import import_file

from ui.dialogs import ImportPreviewDialog
from ui.theme_tokens import apply_theme
from ui.workers import TaskManager


def test_preview_navigation_reaches_row_51_and_last(qtbot, context, service, tmp_path):
    apply_theme(QApplication.instance())
    preview = service.preview_import(import_file(tmp_path), context.storage_generation,
                                     {"customer_mode": "all", "core_only": True})
    tasks = TaskManager(context)
    dialog = ImportPreviewDialog(preview, service, tasks)
    qtbot.addWidget(dialog)
    dialog.show()
    assert hasattr(dialog, "next_page"), "Preview has no way to inspect rows after 50"
    qtbot.mouseClick(dialog.next_page, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not tasks.jobs, timeout=5000)
    assert dialog.table.item(0, 1).text() == "PAGE-051"
    notes = [dialog.table.horizontalHeaderItem(i).text() for i in range(dialog.table.columnCount())].index("备注")
    assert dialog.table.item(0, notes).text() == "核对备注51"
    qtbot.mouseClick(dialog.next_page, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not tasks.jobs, timeout=5000)
    assert dialog.table.item(22, 1).text() == "PAGE-123"
    assert not dialog.next_page.isEnabled() and dialog.previous_page.isEnabled()
    assert "101–123" in dialog.page_status.text()
    dialog.accept()


def test_latest_read_replaces_queued_jobs(qtbot, context):
    assert "latest_key" in inspect.signature(TaskManager.submit).parameters, "Old reads remain queued"
    tasks = TaskManager(context)
    tasks.read_pool.setMaxThreadCount(1)
    release, started = threading.Event(), threading.Event()
    calls, results, errors = [], [], []

    def blocker():
        started.set()
        assert release.wait(5)

    tasks.submit(blocker, lambda _: None, errors.append)
    qtbot.waitUntil(started.is_set, timeout=2000)
    try:
        for number in range(20):
            tasks.submit(lambda value=number: (calls.append(value), value)[1], results.append,
                         errors.append, latest_key="query")
        assert len(tasks.jobs) <= 2
    finally:
        release.set()
        qtbot.waitUntil(lambda: not tasks.jobs, timeout=5000)
        tasks.read_pool.waitForDone()
    assert calls == [19] and results == [19] and not errors


def test_running_sql_read_cancels_but_write_finishes(qtbot, context):
    tasks = TaskManager(context)
    started = threading.Event()
    results, errors, writes = [], [], []

    def slow_sql():
        with context.store.connection() as db:
            started.set()
            return db.execute("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000000) "
                              "SELECT sum(x) FROM n").fetchone()[0]

    tasks.submit(slow_sql, results.append, errors.append, latest_key="query")
    qtbot.waitUntil(started.is_set, timeout=2000)
    tasks.submit(lambda: 7, results.append, errors.append, latest_key="query")
    tasks.submit(lambda: context.store.add({"customer": "取消读取测试", "grade": "SAFE", "price": "10",
                                            "effective_date": "2026-10-12"}), writes.append, errors.append, write=True)
    qtbot.waitUntil(lambda: bool(writes) and results == [7], timeout=3000)
    qtbot.waitUntil(lambda: not tasks.jobs, timeout=1000)
    tasks.read_pool.waitForDone()
    tasks.write_pool.waitForDone()
    assert not errors and writes[0]["added"]
