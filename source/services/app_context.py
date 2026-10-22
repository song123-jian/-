"""Storage generation and a single critical section for all mutations."""
from __future__ import annotations

import secrets
import threading
from dataclasses import dataclass, field
from pathlib import Path

from domain import BackendChangedError, ValidationError


@dataclass
class AppContext:
    store: object
    folder: Path
    storage_generation: str = field(default_factory=lambda: secrets.token_urlsafe(20))
    operation_lock: threading.RLock = field(default_factory=threading.RLock, repr=False)
    state_lock: threading.RLock = field(default_factory=threading.RLock, repr=False)
    previews: dict = field(default_factory=dict, repr=False)
    data_generation: int = 0
    closing: bool = False

    def __post_init__(self):
        self.folder = Path(self.folder).resolve()

    def assert_generation(self, generation):
        if not isinstance(generation, str) or not generation:
            raise ValidationError("缺少存储代次，请刷新后重新操作")
        if generation != self.storage_generation:
            raise BackendChangedError("数据库已切换，请刷新后重新操作")
        if self.closing:
            raise ValidationError("程序正在退出，请等待已开始的操作完成")

    def capture(self, generation):
        with self.state_lock:
            self.assert_generation(generation)
            return self.store, self.storage_generation

    def assert_data_generation(self, generation):
        if generation is not None and generation != self.data_generation:
            raise ValidationError("客户状态已变化，请重新打开表单或重新预览")

    def invalidate_customer_data(self):
        with self.state_lock:
            self.data_generation += 1
            self.previews.clear()

