"""A cloud upgrade must recover polling without restarting the desktop app."""
from ui.main_window import MainWindow


def test_missing_upgrade_keeps_timer_and_success_restarts_it(qtbot, context):
    window = MainWindow(context)

    def close(widget):
        widget.request_exit()
        qtbot.waitUntil(lambda: widget._ready_to_close, timeout=10000)

    qtbot.addWidget(window, before_close_func=close)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    window.sync_applied({'available': False, 'message': '云端同步待升级'})
    assert window.sync_timer.isActive() and window.sync_timer.interval() == 60000
    window.sync_applied(dict(available=True, schema_epoch='epoch', owner_id='owner', data_version='1',
                             business_date='2026-10-19', last_read_at='2026-10-19T12:00:00+08:00'))
    assert window.sync_timer.isActive() and window.sync_timer.interval() == 15000
    assert '已读取' in window.sync_label.text()
