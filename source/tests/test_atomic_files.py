"""Atomic same-volume copies preserve complete backups on failure."""
from pathlib import Path

import pytest

from storage import atomic_files
from storage.atomic_files import atomic_copy


def test_atomic_copy_streams_source_and_replaces_with_complete_contents(tmp_path, monkeypatch):
    source = tmp_path / "source.sqlite3"
    target = tmp_path / "target.sqlite3"
    payload = bytes(range(256)) * 8192
    source.write_bytes(payload)
    target.write_bytes(b"old-complete-backup")
    original_read_bytes = Path.read_bytes

    def reject_source_read_bytes(path):
        if path == source:
            raise AssertionError("atomic copy must stream the source")
        return original_read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", reject_source_read_bytes)
    atomic_copy(source, target)

    with target.open("rb") as handle:
        assert handle.read() == payload
    assert not list(tmp_path.glob(".atomic-*"))


def test_atomic_copy_preserves_previous_target_when_replace_fails(tmp_path, monkeypatch):
    source = tmp_path / "source.sqlite3"
    target = tmp_path / "target.sqlite3"
    source.write_bytes(b"new-complete-backup")
    target.write_bytes(b"old-complete-backup")

    def fail_replace(*args):
        raise OSError("injected replace failure")

    monkeypatch.setattr(atomic_files.os, "replace", fail_replace)
    with pytest.raises(OSError, match="injected replace failure"):
        atomic_copy(source, target)

    assert target.read_bytes() == b"old-complete-backup"
    assert not list(tmp_path.glob(".atomic-*"))
