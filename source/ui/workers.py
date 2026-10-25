"""Qt task dispatch with parallel reads, serialized writes and safe shutdown."""
from __future__ import annotations

import logging
import secrets
import threading
import traceback

from PySide6.QtCore import QObject, QRunnable, QThreadPool, QTimer, Signal, Slot

from domain import BackendChangedError, NetworkError, StorageError
from services.read_control import ReadCancelled, read_scope


class WorkerSignals(QObject):
    result = Signal(str, object)
    error = Signal(str, object)
    progress = Signal(str, int, str)
    finished = Signal(str)


class Worker(QRunnable):
    def __init__(self, job_id, function, write=False):
        super().__init__()
        self.setAutoDelete(False)
        self.job_id = job_id
        self.function = function
        self.write = write
        self.signals = WorkerSignals()
        self.cancelled = threading.Event()

    def _log_failure(self, error):
        if isinstance(error, PermissionError):
            error_code = "permission_denied"
        elif isinstance(error, FileNotFoundError):
            error_code = "file_not_found"
        elif isinstance(error, NetworkError):
            error_code = "network_error"
        elif isinstance(error, OSError):
            error_code = "io_error"
        elif isinstance(error, StorageError):
            error_code = "storage_error"
        elif isinstance(error, ValueError):
            error_code = "validation_error"
        else:
            error_code = "unexpected_error"
        logging.error("Background task failed (%s, operation_id=%s, phase=%s, error_code=%s, errno=%s, winerror=%s)\n%s",
                      type(error).__name__, self.job_id, "write" if self.write else "read", error_code,
                      getattr(error, "errno", None), getattr(error, "winerror", None),
                      "".join(traceback.format_tb(error.__traceback__)))

    @Slot()
    def run(self):
        try:
            if not self.cancelled.is_set():
                self.signals.progress.emit(self.job_id, 0, "处理中…")
                with read_scope(None if self.write else self.cancelled):
                    result = self.function()
                self.signals.result.emit(self.job_id, result)
        except ReadCancelled:
            pass
        except (ValueError, StorageError) as exc:
            self._log_failure(exc)
            self.signals.error.emit(self.job_id, exc)
        except Exception as exc:
            self._log_failure(exc)
            if isinstance(exc, PermissionError):
                message = "文件无法访问，请关闭占用文件的程序，或选择有读写权限的位置后重试"
            elif isinstance(exc, FileNotFoundError):
                message = "文件不存在或已被移动，请重新选择文件后重试"
            elif isinstance(exc, OSError):
                message = "文件读写失败，请检查文件占用、磁盘空间及保存位置后重试"
            else:
                message = f"操作失败（编号 {self.job_id}），请查看程序数据目录中的 app.log 或联系维护人员"
            self.signals.error.emit(self.job_id, StorageError(message))
        finally:
            self.signals.finished.emit(self.job_id)


class TaskManager(QObject):
    busyChanged = Signal(bool)
    writesChanged = Signal(int)
    allFinished = Signal()
    drained = Signal()
    progress = Signal(int, str)

    def __init__(self, context, parent=None):
        super().__init__(parent)
        self.context = context
        self.read_pool = QThreadPool(self)
        self.read_pool.setMaxThreadCount(3)
        self.write_pool = QThreadPool(self)
        self.write_pool.setMaxThreadCount(1)
        self.drain_timer = QTimer(self)
        self.drain_timer.setInterval(25)
        self.drain_timer.timeout.connect(self._check_drained)
        self.jobs = {}
        self.closing = False
        self._drain_emitted = False

    @property
    def is_drained(self):
        return (not self.jobs and self.read_pool.activeThreadCount() == 0
                and self.write_pool.activeThreadCount() == 0)

    @property
    def write_count(self):
        return sum(job["write"] for job in self.jobs.values())

    def submit(self, function, result, error, *, generation=None, write=False, allow_generation_change=False,
               latest_key=None):
        if self.closing:
            return None
        if write and latest_key is not None:
            raise ValueError("写入任务不能被新查询取消")
        if latest_key is not None:
            self._cancel_reads(latest_key)
        job_id = secrets.token_hex(8)
        worker = Worker(job_id, function, write)
        self.jobs[job_id] = {"worker": worker, "result": result, "error": error,
                             "generation": generation, "write": write, "allow_change": allow_generation_change,
                             "data_generation": self.context.data_generation, "latest_key": latest_key}
        worker.signals.result.connect(self._result)
        worker.signals.error.connect(self._error)
        worker.signals.progress.connect(self._progress)
        worker.signals.finished.connect(self._finished)
        self.busyChanged.emit(True)
        self.writesChanged.emit(self.write_count)
        (self.write_pool if write else self.read_pool).start(worker)
        return job_id

    def _cancel_reads(self, latest_key=None):
        for job_id, job in list(self.jobs.items()):
            if not job["write"] and (latest_key is None or job["latest_key"] == latest_key):
                worker = job["worker"]
                worker.cancelled.set()
                if self.read_pool.tryTake(worker):
                    self.jobs.pop(job_id, None)

    def cancel_reads(self, latest_key):
        self._cancel_reads(latest_key)
        self._emit_state()

    @Slot(str, object)
    def _result(self, job_id, value):
        job = self.jobs.get(job_id)
        if not job or self.closing or job["worker"].cancelled.is_set():
            return
        if not job["write"] and job["data_generation"] != self.context.data_generation:
            return
        if job["generation"] and job["generation"] != self.context.storage_generation and not job["allow_change"]:
            if job["write"]:
                job["error"](BackendChangedError("数据库已切换，请重新操作"))
            return
        job["result"](value)

    @Slot(str, object)
    def _error(self, job_id, error):
        job = self.jobs.get(job_id)
        if job and not self.closing and not job["worker"].cancelled.is_set():
            if not job["write"] and job["data_generation"] != self.context.data_generation:
                return
            if job["generation"] and job["generation"] != self.context.storage_generation and not job["write"]:
                return
            job["error"](error)

    @Slot(str, int, str)
    def _progress(self, job_id, amount, message):
        if job_id in self.jobs:
            self.progress.emit(amount, message)

    @Slot(str)
    def _finished(self, job_id):
        self.jobs.pop(job_id, None)
        self._emit_state()

    def _emit_state(self):
        self.busyChanged.emit(bool(self.jobs))
        self.writesChanged.emit(self.write_count)
        if not self.jobs:
            self.allFinished.emit()
            self._check_drained()

    def _check_drained(self):
        if not self.closing or not self.is_drained:
            return False
        self.drain_timer.stop()
        if not self._drain_emitted:
            self._drain_emitted = True
            self.drained.emit()
        return True

    def begin_shutdown(self):
        if self.closing:
            self._check_drained()
            return
        self.closing = True
        self._cancel_reads()
        self._emit_state()
        if not self._drain_emitted:
            self.drain_timer.start()
            self._check_drained()
