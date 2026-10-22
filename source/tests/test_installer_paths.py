import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
POWERSHELL = Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
pytestmark = pytest.mark.skipif(os.name != 'nt', reason='Windows installer integration tests')


def run_ps(*arguments):
    environment = {key: value for key, value in os.environ.items() if key.upper() != 'PSMODULEPATH'}
    return subprocess.run(
        [str(POWERSHELL), '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', *map(str, arguments)],
        capture_output=True, timeout=60, env=environment,
    )


@pytest.fixture(scope='module')
def setup_exe(tmp_path_factory):
    folder = tmp_path_factory.mktemp('installer-build')
    stub = folder / 'stub.cs'
    stub.write_text('class Stub { static int Main() { return 0; } }', encoding='utf-8')
    compiler = Path(os.environ['SystemRoot']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    payload = folder / 'stub.exe'
    subprocess.run([str(compiler), '/nologo', f'/out:{payload}', str(stub)], check=True, capture_output=True)
    built = run_ps('-File', ROOT / 'source/build_legacy_installer.ps1', '-ApplicationExe', payload,
                   '-OutputDirectory', folder)
    assert built.returncode == 0, built.stdout + built.stderr
    return next(folder.glob('*-Setup.exe'))


def run_setup(setup, folder, *arguments):
    report = folder / 'setup-report.txt'
    result = subprocess.run([str(setup), '--quiet', '--report-file', str(report), *map(str, arguments)],
                            capture_output=True, timeout=60)
    return result.returncode, report.read_text(encoding='utf-8')


def test_custom_directory_roundtrip_preserves_data_and_unmanaged_files(setup_exe, tmp_path):
    target = tmp_path / 'custom 中文 & space'
    code, report = run_setup(setup_exe, tmp_path, '--isolated-root', tmp_path, '--install-dir', target)
    assert code == 0 and 'INSTALL_OK=' in report, report
    state = json.loads((target / '.price-query-install.json').read_text(encoding='utf-8'))
    assert Path(state['installDirectory']) == target
    assert len(state['shortcuts']) == 3
    (target / 'data').mkdir()
    marker = target / 'data/keep.txt'
    marker.write_bytes(b'keep-user-data')
    unmanaged = target / 'personal.txt'
    unmanaged.write_bytes(b'keep-unmanaged')
    app = target / '工作.exe'
    assert app.exists()
    assert all(Path(link).is_file() for link in state['shortcuts'])
    duplicate_code, duplicate_report = run_setup(
        setup_exe, tmp_path, '--isolated-root', tmp_path, '--install-dir', target,
    )
    assert duplicate_code != 0 and 'INSTALL_OK=' not in duplicate_report
    removed = run_ps('-File', target / 'Uninstall.ps1', '-Quiet')
    assert removed.returncode == 0, removed.stdout + removed.stderr
    assert not app.exists()
    assert all(not Path(link).exists() for link in state['shortcuts'])
    assert marker.read_bytes() == b'keep-user-data'
    assert unmanaged.read_bytes() == b'keep-unmanaged'


def test_default_isolated_directory_stays_compatible(setup_exe, tmp_path):
    code, report = run_setup(setup_exe, tmp_path, '--isolated-root', tmp_path)
    assert code == 0 and 'INSTALL_OK=' in report, report
    target = tmp_path / 'Programs/PriceQueryDesktop'
    assert (target / '工作.exe').is_file()
    removed = run_ps('-File', target / 'Uninstall.ps1', '-Quiet')
    assert removed.returncode == 0, removed.stdout + removed.stderr


def test_release_revision_and_payload_are_traceable(setup_exe, tmp_path):
    metadata_path = setup_exe.with_suffix('.release.json')
    assert metadata_path.is_file(), 'Missing machine-readable installer release record'
    metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
    assert metadata['installerRevision'] == 'r2'
    assert '-r2-Setup.exe' in setup_exe.name
    target = tmp_path / 'revision-test'
    code, report = run_setup(setup_exe, tmp_path, '--isolated-root', tmp_path, '--install-dir', target)
    assert code == 0, report
    try:
        state = json.loads((target / '.price-query-install.json').read_text(encoding='utf-8'))
        package = json.loads((target / 'package.json').read_text(encoding='utf-8'))
        assert state['installerRevision'] == package['installerRevision'] == metadata['installerRevision']
        assert state['version'] == metadata['applicationVersion']
        assert hashlib.sha256(setup_exe.read_bytes()).hexdigest().upper() == metadata['setupSha256']
        assert hashlib.sha256((target / '工作.exe').read_bytes()).hexdigest().upper() == metadata['applicationSha256']
    finally:
        removed = run_ps('-File', target / 'Uninstall.ps1', '-Quiet')
        assert removed.returncode == 0, removed.stdout + removed.stderr


def test_existing_release_output_is_not_overwritten(setup_exe):
    before = setup_exe.read_bytes()
    result = run_ps('-File', ROOT / 'source/build_legacy_installer.ps1', '-ApplicationExe', setup_exe,
                    '-OutputDirectory', setup_exe.parent)
    assert result.returncode != 0
    assert setup_exe.read_bytes() == before


def test_invalid_installer_revision_is_rejected(setup_exe, tmp_path):
    result = run_ps('-File', ROOT / 'source/build_legacy_installer.ps1', '-ApplicationExe', setup_exe,
                    '-OutputDirectory', tmp_path, '-InstallerRevision', '../bad')
    assert result.returncode != 0
    assert not list(tmp_path.glob('*.exe'))


def test_isolated_verification_records_revision_and_cleanup(setup_exe, tmp_path):
    extracted = tmp_path / 'extracted'
    code, report = run_setup(setup_exe, tmp_path, '--extract', extracted)
    assert code == 0, report
    root = tmp_path / 'acceptance'
    result = run_ps('-File', ROOT / 'source/installer/verify-custom-install.ps1',
                    '-SetupExe', setup_exe, '-ExpectedApplicationExe', extracted / 'app.exe',
                    '-TestRoot', root, '-Isolated')
    assert result.returncode == 0, result.stdout + result.stderr
    verification = json.loads((root / 'verification.json').read_text(encoding='utf-8'))
    assert verification['status'] == 'passed'
    assert verification['installerRevision'] == 'r2'
    assert verification['normalRegistryMode'] is False
    assert all(verification['checks'].values())
    assert 'registryRemoved' not in verification['checks']


@pytest.mark.parametrize('kind', ['drive-root', 'relative', 'system', 'trailing-dot', 'outside', 'occupied'])
def test_unsafe_paths_are_rejected_without_installing(setup_exe, tmp_path, kind):
    target = {
        'drive-root': Path(tmp_path.anchor),
        'relative': Path('relative-install'),
        'system': Path(os.environ['SystemRoot']) / 'PriceQuery-QA',
        'trailing-dot': tmp_path / 'bad.',
        'outside': tmp_path.parent / 'outside-sandbox',
        'occupied': tmp_path / 'occupied',
    }[kind]
    if kind == 'occupied':
        target.mkdir()
        (target / 'personal.txt').write_bytes(b'keep')
    code, report = run_setup(setup_exe, tmp_path, '--isolated-root', tmp_path, '--install-dir', target)
    assert code != 0 and 'INSTALL_OK=' not in report, report
    assert not (tmp_path / 'Start Menu').exists()
    if kind == 'occupied':
        assert (target / 'personal.txt').read_bytes() == b'keep'


def test_extract_and_custom_install_are_mutually_exclusive(setup_exe, tmp_path):
    extract = tmp_path / 'extract'
    code, report = run_setup(setup_exe, tmp_path, '--extract', extract, '--install-dir', tmp_path / 'app')
    assert code != 0, report
    assert not extract.exists()


def test_directory_junction_is_rejected(setup_exe, tmp_path):
    destination = tmp_path / 'destination'
    destination.mkdir()
    link = tmp_path / 'linked'
    command = f"New-Item -ItemType Junction -Path '{link}' -Target '{destination}' | Out-Null"
    created = run_ps('-Command', command)
    assert created.returncode == 0, created.stdout + created.stderr
    try:
        code, report = run_setup(setup_exe, tmp_path, '--isolated-root', tmp_path, '--install-dir', link / 'app')
        assert code != 0 and 'INSTALL_OK=' not in report, report
        assert not (destination / 'app').exists()
    finally:
        os.rmdir(link)


def test_uninstall_refuses_mismatched_installation_state(setup_exe, tmp_path):
    target = tmp_path / 'custom'
    code, report = run_setup(setup_exe, tmp_path, '--isolated-root', tmp_path, '--install-dir', target)
    assert code == 0, report
    state_path = target / '.price-query-install.json'
    original = state_path.read_bytes()
    state = json.loads(original)
    state['installDirectory'] = str(tmp_path / 'other')
    state_path.write_text(json.dumps(state), encoding='utf-8')
    rejected = run_ps('-File', target / 'Uninstall.ps1', '-Quiet')
    assert rejected.returncode != 0
    assert (target / '工作.exe').exists()
    state_path.write_bytes(original)
    removed = run_ps('-File', target / 'Uninstall.ps1', '-Quiet')
    assert removed.returncode == 0, removed.stdout + removed.stderr
