"""Cooperative cancellation scoped to one worker; writes never receive a token."""
from contextlib import contextmanager
from contextvars import ContextVar

_cancelled = ContextVar("price_read_cancelled", default=None)


class ReadCancelled(ValueError):
    pass


def check_read_cancelled():
    event = _cancelled.get()
    if event is not None and event.is_set():
        raise ReadCancelled("读取已被最新查询替代")


def read_was_cancelled():
    event = _cancelled.get()
    return event is not None and event.is_set()


@contextmanager
def read_scope(event):
    token = _cancelled.set(event)
    try:
        check_read_cancelled()
        yield
        check_read_cancelled()
    finally:
        _cancelled.reset(token)
