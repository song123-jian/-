import re
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1]


def test_build_has_isolated_workspace_and_machine_readable_evidence():
    script = (SOURCE / 'build.ps1').read_text(encoding='utf-8')
    assert '$buildSource' in script, 'Generated resources must be isolated from the source tree'
    assert 'build-verification.json' in script, 'Missing build identity and verification record'
    assert 'applicationSha256' in script
    assert 'already exists' in script, 'Existing release must not be overwritten'


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
