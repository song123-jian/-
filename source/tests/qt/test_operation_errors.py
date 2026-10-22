"""Actionable file errors without losing safe service diagnostics or leaking secrets."""
import pytest

from domain import StorageError
from ui.workers import Worker


@pytest.mark.parametrize("failure,expected", [
    (StorageError("整批导入失败，事务已回滚；请重新预览"), "事务已回滚"),
    (PermissionError("private-token"), "文件无法访问"),
    (FileNotFoundError("private-token"), "文件不存在"),
    (OSError("private-token"), "文件读写失败"),
    (RuntimeError("private-token"), "操作失败"),
])
def test_worker_keeps_safe_errors_and_classifies_file_failures(qapp, failure, expected):
    def fail():
        raise failure

    received = []
    worker = Worker("regression", fail)
    worker.signals.error.connect(lambda job, error: received.append(error))
    worker.run()
    assert len(received) == 1
    assert expected in str(received[0])
    assert "private-token" not in str(received[0])
    if isinstance(failure, StorageError):
        assert received[0] is failure
