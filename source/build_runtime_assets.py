"""Collect SSL data that is required by the selected Python runtime."""

import json
import ssl
import sys
from pathlib import Path


def ssl_data_arguments(ssl_module_path: Path) -> list[str]:
    certificate_policy = ssl_module_path.with_name('codex-rejected-cas.pem')
    if not certificate_policy.is_file():
        return []
    # Frozen ssl.py resolves its policy beside the unpacked standard library.
    return ['--add-data', f'{certificate_policy};.']


if __name__ == '__main__':
    arguments = ssl_data_arguments(Path(ssl.__file__))
    from PySide6.QtCore import QLibraryInfo

    chinese_qm = Path(QLibraryInfo.path(QLibraryInfo.LibraryPath.TranslationsPath)) / 'qtbase_zh_CN.qm'
    if not chinese_qm.is_file():
        raise SystemExit('Required Simplified Chinese Qt translation is missing')
    arguments.extend(['--add-data', f'{chinese_qm};translations'])
    if '--json' in sys.argv:
        print(json.dumps(arguments, ensure_ascii=True))
    else:
        for argument in arguments:
            print(argument)
