import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
POWERSHELL = Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
pytestmark = pytest.mark.skipif(os.name != 'nt', reason='Windows shortcut integration tests')


def _update_shortcut(script, exe, shortcut, icon, version):
    result = subprocess.run(
        [str(POWERSHELL), '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
         '-ApplicationExe', str(exe), '-ShortcutPath', str(shortcut), '-IconPath', str(icon),
         '-ApplicationVersion', version],
        capture_output=True, timeout=30, encoding='utf-8', errors='replace',
    )
    assert result.returncode == 0, result.stdout + result.stderr
    result_line = next((line for line in result.stdout.splitlines() if line.startswith('SHORTCUT_JSON=')), None)
    assert result_line is not None, result.stdout
    return json.loads(result_line.removeprefix('SHORTCUT_JSON='))


def test_shortcut_replacement_is_verified_and_keeps_exe_directory(tmp_path):
    script = ROOT / 'source/update_portable_shortcut.ps1'
    assert script.is_file(), 'A reproducible portable shortcut updater is required'

    old_exe = tmp_path / '工作-1.7.6.exe'
    new_exe = tmp_path / '工作-1.7.8.exe'
    icon = tmp_path / '工作图标.ico'
    shortcut = tmp_path / '工作快捷启动.lnk'
    for path in (old_exe, new_exe, icon):
        path.write_bytes(b'test artifact')

    _update_shortcut(script, old_exe, shortcut, icon, '1.7.6')
    state = _update_shortcut(script, new_exe, shortcut, icon, '1.7.8')

    assert Path(state['targetPath']) == new_exe.resolve()
    assert Path(state['workingDirectory']) == tmp_path.resolve()
    assert state['arguments'] == ''
    assert state['iconLocation'].casefold() == f'{icon.resolve()},0'.casefold()
    assert state['description'] == '启动工作 1.7.8（使用 EXE 同级 data）'
    assert not list(tmp_path.glob('*.tmp.lnk'))
    assert not list(tmp_path.glob('*.bak.lnk'))
