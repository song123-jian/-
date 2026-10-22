"""Native installer tests use a unique current-user QA identity."""

import ctypes
import hashlib
import json
import os
import subprocess
import time
import uuid
from ctypes import wintypes
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
POWERSHELL = Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
pytestmark = pytest.mark.skipif(os.name != 'nt', reason='Windows installer integration tests')


def run_ps(*arguments):
    environment = {key: value for key, value in os.environ.items() if key.upper() != 'PSMODULEPATH'}
    return subprocess.run(
        [str(POWERSHELL), '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', *map(str, arguments)],
        capture_output=True, timeout=120, env=environment,
    )


def registered_directory(app_id):
    import winreg

    key = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + app_id + '_is1'
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as handle:
            return Path(winreg.QueryValueEx(handle, 'InstallLocation')[0])
    except FileNotFoundError:
        return None


@pytest.fixture(scope='module')
def setup_package(tmp_path_factory):
    folder = tmp_path_factory.mktemp('native-installer-build')
    stub = folder / 'stub.cs'
    stub.write_text(
        'class Stub { static void Main(string[] args) { '
        'if (args.Length > 0) System.Threading.Thread.Sleep(60000); } }', encoding='utf-8',
    )
    compiler = Path(os.environ['SystemRoot']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    payload = folder / 'stub.exe'
    subprocess.run([str(compiler), '/nologo', '/target:winexe', f'/out:{payload}', str(stub)],
                   check=True, capture_output=True)
    identity = 'qa-' + uuid.uuid4().hex
    built = run_ps('-File', ROOT / 'source/build_installer.ps1', '-ApplicationExe', payload,
                   '-OutputDirectory', folder, '-TestIdentity', identity)
    assert built.returncode == 0, built.stdout + built.stderr
    setup = next(folder.glob('*-Setup.exe'))
    metadata = json.loads(setup.with_suffix('.release.json').read_text(encoding='utf-8'))
    yield setup, metadata, payload, identity
    installed = registered_directory(metadata['appId']) if 'appId' in metadata else None
    if installed and (installed / 'unins000.exe').exists():
        removed = subprocess.run([str(installed / 'unins000.exe'), '/VERYSILENT', '/SUPPRESSMSGBOXES',
                                  '/NORESTART'], timeout=60, capture_output=True)
        assert removed.returncode == 0, removed.stdout + removed.stderr


def install(package, target, log):
    return subprocess.run([str(package[0]), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/SP-', '/NORESTART',
                           f'/DIR={target}', f'/LOG={log}', '/TASKS='],
                          capture_output=True, timeout=90)


def install_default(package, log):
    return subprocess.run([str(package[0]), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/SP-', '/NORESTART',
                           f'/LOG={log}', '/TASKS='], capture_output=True, timeout=90)


def uninstall(target, log, purge_data=False):
    arguments = [str(target / 'unins000.exe'), '/VERYSILENT', '/SUPPRESSMSGBOXES',
                 '/NORESTART', f'/LOG={log}']
    if purge_data:
        arguments.append('/PURGEDATA')
    result = subprocess.run(arguments, capture_output=True, timeout=60)
    if result.returncode == 0:
        deadline = time.monotonic() + 10
        while (target / 'unins000.exe').exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not (target / 'unins000.exe').exists(), 'Native uninstaller self-cleanup did not finish'
        if purge_data:
            completion = (
                'Personal data directory deleted after explicit user choice.',
                'Personal data retained because a reparse point exists or the data directory could not be verified.',
                'Personal data deletion was incomplete; remaining files were retained.',
            )
            deadline = time.monotonic() + 10
            log_text = ''
            while time.monotonic() < deadline:
                if log.exists():
                    log_text = log.read_text(errors='replace')
                    if any(message in log_text for message in completion):
                        break
                time.sleep(0.05)
            assert any(message in log_text for message in completion), log_text
    return result


def _user32():
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    enum_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = [enum_proc, wintypes.LPARAM]
    user32.EnumChildWindows.argtypes = [wintypes.HWND, enum_proc, wintypes.LPARAM]
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetDlgItem.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.GetDlgItem.restype = wintypes.HWND
    user32.SendMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.SendMessageW.restype = ctypes.c_ssize_t
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32._enum_proc = enum_proc
    return user32


def _desktop_dialogs(user32, marker=None, yes_no=False):
    windows = []

    def window_text(hwnd):
        buffer = ctypes.create_unicode_buffer(user32.GetWindowTextLengthW(hwnd) + 1)
        user32.GetWindowTextW(hwnd, buffer, len(buffer))
        return buffer.value

    @user32._enum_proc
    def visit_window(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        owner_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner_pid))
        captions = [window_text(hwnd)]

        @user32._enum_proc
        def visit_child(child, _):
            captions.append(window_text(child))
            return True

        user32.EnumChildWindows(hwnd, visit_child, 0)
        text = '\n'.join(caption for caption in captions if caption)
        if marker is not None and marker not in text:
            return True
        if yes_no and (not user32.GetDlgItem(hwnd, 6) or not user32.GetDlgItem(hwnd, 7)):
            return True
        windows.append((hwnd, text, owner_pid.value))
        return True

    user32.EnumWindows(visit_window, 0)
    return windows


def _click_message_button(user32, dialog, button_id):
    button = user32.GetDlgItem(dialog, button_id)
    assert button
    user32.SetForegroundWindow(dialog)
    user32.SendMessageW(button, 0x00F5, 0, 0)  # BM_CLICK


def uninstall_interactively(target, log, keep_data, identity):
    user32 = _user32()
    process = subprocess.Popen([str(target / 'unins000.exe'), f'/LOG={log}'], cwd=target,
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL)
    owner_ids = {process.pid}
    try:
        deadline = time.monotonic() + 8
        prompt = []
        while time.monotonic() < deadline:
            prompt = _desktop_dialogs(user32, marker='是否保留个人资料')
            if prompt:
                owner_ids.add(prompt[0][2])
                break
            time.sleep(0.05)
        assert prompt, f'Interactive personal-data prompt not found; log: {log.read_text(errors="replace") if log.exists() else "missing"}'
        _click_message_button(user32, prompt[0][0], 6 if keep_data else 7)

        confirmation_text = '确认要完全移除 工作 QA ' + identity
        deadline = time.monotonic() + 10
        confirmation = []
        while time.monotonic() < deadline:
            confirmation = _desktop_dialogs(user32, marker=confirmation_text, yes_no=True)
            if confirmation:
                owner_ids.add(confirmation[0][2])
                break
            time.sleep(0.05)
        assert confirmation, f'Uninstaller confirmation prompt not found; log: {log.read_text(errors="replace") if log.exists() else "missing"}'
        _click_message_button(user32, confirmation[0][0], 6)

        completion_text = '已顺利从您的计算机中移除 工作 QA ' + identity
        deadline = time.monotonic() + 10
        completion = []
        process_exit_time = None
        while time.monotonic() < deadline:
            completion = _desktop_dialogs(user32, marker=completion_text)
            if completion:
                owner_ids.add(completion[0][2])
                break
            if process.poll() is not None:
                process_exit_time = process_exit_time or time.monotonic()
                if time.monotonic() - process_exit_time >= 2:
                    break
            time.sleep(0.05)
        if completion:
            user32.SendMessageW(completion[0][0], 0x0010, 0, 0)  # WM_CLOSE
        assert process.wait(timeout=10) == 0, f'Interactive uninstaller exited {process.returncode}.'
        expected = 'Personal data directory deleted after explicit user choice.' if not keep_data else None
        log_text = ''
        log_deadline = time.monotonic() + 10
        while time.monotonic() < log_deadline:
            if log.exists():
                log_text = log.read_text(errors='replace')
                if 'Uninstallation process succeeded.' in log_text and (expected is None or expected in log_text):
                    break
            time.sleep(0.05)
        assert 'Uninstallation process succeeded.' in log_text, log_text
        if expected:
            assert expected in log_text, log_text
        cleanup_deadline = time.monotonic() + 10
        while (target / 'unins000.exe').exists() and time.monotonic() < cleanup_deadline:
            time.sleep(0.05)
        assert not (target / 'unins000.exe').exists(), 'Native uninstaller self-cleanup did not finish'
        return process.returncode
    finally:
        if process.poll() is None:
            for process_id in owner_ids:
                subprocess.run(['taskkill.exe', '/PID', str(process_id), '/T', '/F'],
                               capture_output=True, timeout=10)
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)


def test_release_uses_native_engine_and_traceable_payload(setup_package):
    setup, metadata, payload, _ = setup_package
    assert metadata['installerEngine'] == 'Inno Setup'
    assert metadata['installerRevision'] == 'r9'
    assert metadata['applicationVersion'] == '1.7.8'
    assert metadata['isTestPackage'] is True
    assert metadata['applicationSha256'] == hashlib.sha256(payload.read_bytes()).hexdigest().upper()
    assert metadata['setupSha256'] == hashlib.sha256(setup.read_bytes()).hexdigest().upper()
    assert not any(file['target'].lower().endswith(('.ps1', '.cmd')) for file in metadata['files'])


def test_custom_directory_system_registration_and_uninstall_preserve_data(setup_package, tmp_path):
    target = tmp_path / 'custom chinese space & folder'
    installed = install(setup_package, target, tmp_path / 'install.log')
    assert installed.returncode == 0, (tmp_path / 'install.log').read_text(errors='replace')
    try:
        assert registered_directory(setup_package[1]['appId']) == target
        assert hashlib.sha256((target / '工作.exe').read_bytes()).hexdigest().upper() == setup_package[1]['applicationSha256']
        assert (target / 'unins000.exe').is_file()
        assert not (target / 'Uninstall.ps1').exists()
        (target / 'data').mkdir()
        marker = target / 'data/keep.bin'
        marker.write_bytes(b'preserve-test-data\x00\xff')
        personal = target / 'personal.txt'
        personal.write_bytes(b'preserve-unmanaged-file')
        before = hashlib.sha256(marker.read_bytes()).digest()
        removed = uninstall(target, tmp_path / 'uninstall.log')
        assert removed.returncode == 0
        assert not (target / '工作.exe').exists()
        assert registered_directory(setup_package[1]['appId']) is None
        assert hashlib.sha256(marker.read_bytes()).digest() == before
        assert personal.read_bytes() == b'preserve-unmanaged-file'
    finally:
        if registered_directory(setup_package[1]['appId']) == target:
            assert uninstall(target, tmp_path / 'cleanup.log').returncode == 0


def test_orphaned_registration_is_recovered_without_touching_old_data(setup_package, tmp_path):
    import winreg

    setup, metadata, _, identity = setup_package
    orphan = tmp_path / 'orphaned-install'
    old_data = orphan / 'data'
    old_data.mkdir(parents=True)
    marker = old_data / 'keep.bin'
    marker.write_bytes(b'preserve-orphan-data\x00\xff')
    personal = orphan / 'personal.txt'
    personal.write_bytes(b'preserve-unmanaged-file')
    before = {
        marker: hashlib.sha256(marker.read_bytes()).digest(),
        personal: hashlib.sha256(personal.read_bytes()).digest(),
    }
    registry_key = ('Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'
                    + metadata['appId'] + '_is1')
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, registry_key, 0,
                            winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY) as handle:
        winreg.SetValueEx(handle, 'InstallLocation', 0, winreg.REG_SZ, str(orphan))
        winreg.SetValueEx(handle, 'UninstallString', 0, winreg.REG_SZ,
                          str(orphan / 'unins000.exe'))

    target = setup.parent / ('qa-install-' + identity)
    try:
        installed = install_default(setup_package, tmp_path / 'install.log')
        assert installed.returncode == 0, installed.stdout + installed.stderr
        assert registered_directory(metadata['appId']) == target
        assert (target / 'unins000.exe').is_file()
        assert {path: hashlib.sha256(path.read_bytes()).digest() for path in before} == before

        removed = uninstall(target, tmp_path / 'uninstall.log')
        assert removed.returncode == 0, removed.stdout + removed.stderr
        assert registered_directory(metadata['appId']) is None
        assert {path: hashlib.sha256(path.read_bytes()).digest() for path in before} == before
    finally:
        current = registered_directory(metadata['appId'])
        if current == target and (target / 'unins000.exe').is_file():
            removed = uninstall(target, tmp_path / 'cleanup.log')
            assert removed.returncode == 0, removed.stdout + removed.stderr
        elif current == orphan:
            winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER, registry_key,
                               access=winreg.KEY_WOW64_64KEY)


def test_uninstall_can_delete_only_personal_data_when_requested(setup_package, tmp_path):
    target = tmp_path / 'purge-data'
    installed = install(setup_package, target, tmp_path / 'install.log')
    assert installed.returncode == 0, installed.stdout + installed.stderr
    data = target / 'data'
    data.mkdir()
    marker = data / 'database.bin'
    marker.write_bytes(b'synthetic-personal-data')
    personal = target / 'keep-personal-file.txt'
    personal.write_bytes(b'unmanaged-personal-file')

    removed = uninstall(target, tmp_path / 'purge.log', purge_data=True)
    assert removed.returncode == 0, removed.stdout + removed.stderr
    assert not data.exists()
    assert personal.read_bytes() == b'unmanaged-personal-file'
    assert registered_directory(setup_package[1]['appId']) is None


def test_uninstall_purge_preserves_data_with_reparse_points(setup_package, tmp_path):
    target = tmp_path / 'purge-reparse'
    installed = install(setup_package, target, tmp_path / 'install.log')
    assert installed.returncode == 0, installed.stdout + installed.stderr
    data = target / 'data'
    data.mkdir()
    external = tmp_path / 'external-data'
    external.mkdir()
    marker = external / 'keep.bin'
    marker.write_bytes(b'external-data-must-survive')
    junction = data / 'external'
    created = run_ps('-Command', f"New-Item -ItemType Junction -Path '{junction}' -Target '{external}' | Out-Null")
    assert created.returncode == 0, created.stdout + created.stderr
    removed = uninstall(target, tmp_path / 'purge.log', purge_data=True)
    assert removed.returncode == 0, removed.stdout + removed.stderr
    assert junction.exists()
    assert marker.read_bytes() == b'external-data-must-survive'
    assert registered_directory(setup_package[1]['appId']) is None


def test_uninstall_reparse_scan_fails_closed_on_attribute_error():
    source = (ROOT / 'source/installer/PriceQuery.iss').read_text(encoding='utf-8')
    scanner = source.split('function DirectoryContainsReparsePoint', 1)[1].split('\nfunction PathError', 1)[0]
    assert ('if Attributes = $FFFFFFFF then begin\n'
            '    Result := True;\n'
            '    Exit;\n'
            '  end;') in scanner
    assert ("if not FindFirst(AddBackslash(Path) + '*', FindRec) then begin\n"
            '    Result := True;\n'
            '    Exit;\n'
            '  end;') in scanner


@pytest.mark.parametrize('keep_data', [True, False], ids=['keep-data', 'delete-data'])
def test_interactive_uninstall_asks_whether_to_keep_personal_data(setup_package, tmp_path, keep_data):
    target = tmp_path / ('interactive-keep' if keep_data else 'interactive-delete')
    installed = install(setup_package, target, tmp_path / 'install.log')
    assert installed.returncode == 0, installed.stdout + installed.stderr
    data = target / 'data'
    data.mkdir()
    marker = data / 'database.bin'
    marker.write_bytes(b'synthetic-personal-data')
    personal = target / 'personal.txt'
    personal.write_bytes(b'unmanaged-personal-file')

    assert uninstall_interactively(target, tmp_path / 'interactive-uninstall.log', keep_data,
                                   setup_package[3]) == 0
    assert registered_directory(setup_package[1]['appId']) is None
    assert personal.read_bytes() == b'unmanaged-personal-file'
    if keep_data:
        assert marker.read_bytes() == b'synthetic-personal-data'
    else:
        assert not data.exists()


def test_same_directory_reinstall_and_directory_change_policy(setup_package, tmp_path):
    target = tmp_path / 'original'
    other = tmp_path / 'different'
    assert install(setup_package, target, tmp_path / 'install.log').returncode == 0
    try:
        (target / 'data').mkdir()
        marker = target / 'data/keep.txt'
        marker.write_bytes(b'keep')
        assert install(setup_package, target, tmp_path / 'reinstall.log').returncode == 0
        assert marker.read_bytes() == b'keep'
        rejected = install(setup_package, other, tmp_path / 'change.log')
        assert rejected.returncode != 0
        assert not (other / '工作.exe').exists()
        assert registered_directory(setup_package[1]['appId']) == target
    finally:
        assert uninstall(target, tmp_path / 'uninstall.log').returncode == 0


def test_preserved_data_directory_can_be_reused(setup_package, tmp_path):
    target = tmp_path / 'preserved'
    (target / 'data').mkdir(parents=True)
    marker = target / 'data/keep.txt'
    marker.write_bytes(b'old-data')
    assert install(setup_package, target, tmp_path / 'install.log').returncode == 0
    assert uninstall(target, tmp_path / 'uninstall.log').returncode == 0
    assert marker.read_bytes() == b'old-data'


@pytest.mark.parametrize('kind', ['drive-root', 'relative', 'system', 'trailing-dot', 'reserved', 'occupied'])
def test_unsafe_paths_are_rejected_without_installing(setup_package, tmp_path, kind):
    target = {
        'drive-root': Path(tmp_path.anchor),
        'relative': Path('relative-install'),
        'system': Path(os.environ['SystemRoot']) / 'PriceQuery-QA',
        'trailing-dot': tmp_path / 'bad.',
        'reserved': tmp_path / 'CON.txt',
        'occupied': tmp_path / 'occupied',
    }[kind]
    if kind == 'occupied':
        target.mkdir()
        (target / 'personal.txt').write_bytes(b'keep')
    result = install(setup_package, target, tmp_path / 'rejected.log')
    assert result.returncode != 0
    assert registered_directory(setup_package[1]['appId']) is None
    if kind == 'occupied':
        assert (target / 'personal.txt').read_bytes() == b'keep'


def test_directory_junction_is_rejected(setup_package, tmp_path):
    destination = tmp_path / 'destination'
    destination.mkdir()
    link = tmp_path / 'linked'
    created = run_ps('-Command', f"New-Item -ItemType Junction -Path '{link}' -Target '{destination}' | Out-Null")
    assert created.returncode == 0, created.stdout + created.stderr
    try:
        assert install(setup_package, link / 'app', tmp_path / 'junction.log').returncode != 0
        assert not (destination / 'app').exists()
    finally:
        os.rmdir(link)


def test_uninstall_in_use_keeps_program_and_system_entry(setup_package, tmp_path):
    target = tmp_path / 'occupied-program'
    assert install(setup_package, target, tmp_path / 'install.log').returncode == 0
    process = subprocess.Popen([str(target / '工作.exe'), '--hold'])
    try:
        time.sleep(0.4)
        assert process.poll() is None
        rejected = uninstall(target, tmp_path / 'in-use.log')
        assert rejected.returncode != 0
        assert (target / '工作.exe').is_file()
        assert registered_directory(setup_package[1]['appId']) == target
    finally:
        process.terminate()
        process.wait(timeout=10)
        if registered_directory(setup_package[1]['appId']) == target:
            assert uninstall(target, tmp_path / 'uninstall.log').returncode == 0


def test_changed_ownership_marker_blocks_reinstall(setup_package, tmp_path):
    target = tmp_path / 'marker'
    assert install(setup_package, target, tmp_path / 'install.log').returncode == 0
    marker = target / 'install-info.ini'
    original = marker.read_bytes()
    try:
        marker.write_text('[Setup]\nProductId=unrelated\n', encoding='utf-8')
        assert install(setup_package, target, tmp_path / 'mismatch.log').returncode != 0
        assert (target / '工作.exe').is_file()
    finally:
        marker.write_bytes(original)
        assert uninstall(target, tmp_path / 'uninstall.log').returncode == 0


def test_existing_release_output_is_not_overwritten(setup_package):
    setup, _, payload, identity = setup_package
    before = hashlib.sha256(setup.read_bytes()).digest()
    result = run_ps('-File', ROOT / 'source/build_installer.ps1', '-ApplicationExe', payload,
                    '-OutputDirectory', setup.parent, '-TestIdentity', identity)
    assert result.returncode != 0
    assert hashlib.sha256(setup.read_bytes()).digest() == before


def test_invalid_installer_revision_is_rejected(setup_package, tmp_path):
    _, _, payload, identity = setup_package
    result = run_ps('-File', ROOT / 'source/build_installer.ps1', '-ApplicationExe', payload,
                    '-OutputDirectory', tmp_path, '-InstallerRevision', '../bad', '-TestIdentity', identity)
    assert result.returncode != 0
    assert not list(tmp_path.glob('*.exe'))
