"""Atomic same-volume file operations for backups and exports."""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path


def atomic_copy(source, target):
    source = Path(source).resolve()
    target = Path(target).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".atomic-", dir=target.parent, delete=False) as output:
            temporary = Path(output.name)
            with source.open("rb") as original:
                shutil.copyfileobj(original, output, length=1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return str(target)
