import re
from pathlib import Path

from build_runtime_assets import ssl_data_arguments

SOURCE = Path(__file__).resolve().parents[1]


def test_runtime_ssl_policy_is_bundled_at_the_frozen_ssl_location(tmp_path):
    runtime_lib = tmp_path / 'Python runtime' / 'Lib'
    runtime_lib.mkdir(parents=True)
    policy = runtime_lib / 'codex-rejected-cas.pem'
    policy.write_text('runtime certificate policy', encoding='utf-8')
    assert ssl_data_arguments(runtime_lib / 'ssl.py') == ['--add-data', f'{policy};.']


def test_standard_python_without_extra_ssl_policy_needs_no_data_argument(tmp_path):
    assert ssl_data_arguments(tmp_path / 'ssl.py') == []


def test_build_has_isolated_workspace_and_machine_readable_evidence():
    script = (SOURCE / 'build.ps1').read_text(encoding='utf-8')
    assert '$buildSource' in script, 'Generated resources must be isolated from the source tree'
    assert 'build-verification.json' in script, 'Missing build identity and verification record'
    assert 'applicationSha256' in script
    assert 'already exists' in script, 'Existing release must not be overwritten'


def test_build_requires_a_complete_account_config_before_freezing():
    script = (SOURCE / 'build.ps1').read_text(encoding='utf-8')
    assert 'AccountConfigPath' in script
    assert 'A complete account_config.json is required' in script
    assert 'sb_publishable_' in script
    assert 'placeholder public client configuration' in script


def test_default_build_output_tracks_application_version():
    script = (SOURCE / 'build.ps1').read_text(encoding='utf-8')
    version_read = script.find("Join-Path $PSScriptRoot 'domain.py'")
    output_default = script.index('if (-not $OutputDirectory)')
    assert version_read >= 0, 'Build version must be read before selecting the output directory'
    assert version_read < output_default
    assert re.search(r"work\\release-work-' \+ \$version", script)


def test_frozen_executable_name_is_encoding_safe_and_consistent():
    script = (SOURCE / 'build.ps1').read_text(encoding='utf-8')
    assert all(ord(character) < 128 for character in script), 'Windows PowerShell 5.1 must not decode script literals through a legacy code page'
    assert "$applicationFileName = $applicationBaseName + '.exe'" in script
    assert '--name $applicationBaseName' in script
    assert 'applicationFile = $applicationFileName' in script


def test_default_installer_uses_matching_versioned_build_and_revision():
    script = (SOURCE / 'build_installer.ps1').read_text(encoding='utf-8')
    version_read = script.index("Join-Path $PSScriptRoot 'domain.py'")
    output_default = script.index('if (-not $OutputDirectory)')
    assert version_read < output_default
    assert re.search(r"InstallerRevision\s*=\s*'r9'", script)
    assert re.search(r"work\\release-work-' \+ \$version", script)
    assert re.search(r"release-native-installer-' \+ \$version \+ '-' \+ \$InstallerRevision", script)
