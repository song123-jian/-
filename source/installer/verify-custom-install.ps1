param(
    [Parameter(Mandatory = $true)][string]$SetupExe,
    [Parameter(Mandatory = $true)][string]$ExpectedApplicationExe,
    [Parameter(Mandatory = $true)][string]$TestRoot,
    [switch]$Isolated
)
$ErrorActionPreference = 'Stop'
$SetupExe = (Resolve-Path -LiteralPath $SetupExe).Path
$ExpectedApplicationExe = (Resolve-Path -LiteralPath $ExpectedApplicationExe).Path
$TestRoot = [IO.Path]::GetFullPath($TestRoot).TrimEnd('\', '/')
if ($TestRoot -eq [IO.Path]::GetPathRoot($TestRoot).TrimEnd('\', '/') -or (Test-Path -LiteralPath $TestRoot)) {
    throw 'Use a new dedicated test directory, not a drive root or an existing folder.'
}
$registryKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PriceQueryDesktop'
$title = [string][char]0x5DE5 + [char]0x4F5C
$desktop = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($title + '.lnk')
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) $title
if (-not $Isolated -and ((Test-Path -LiteralPath $registryKey) -or (Test-Path -LiteralPath $desktop) -or (Test-Path -LiteralPath $menu))) {
    throw 'A normal installation or shortcut already exists; verification must not overwrite user state.'
}
[IO.Directory]::CreateDirectory($TestRoot) | Out-Null
$target = Join-Path $TestRoot 'custom & space'
$reportFile = Join-Path $TestRoot 'setup-result.txt'
$checks = [ordered]@{}
$report = [ordered]@{
    date = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')
    environment = [Environment]::OSVersion.VersionString
    setup = $SetupExe
    setupSha256 = (Get-FileHash -LiteralPath $SetupExe -Algorithm SHA256).Hash
    installDirectory = $target
    normalRegistryMode = -not $Isolated
    realCloudAccess = $false
    checks = $checks
    status = 'running'
}
try {
    $setupArguments = '--quiet --install-dir "' + $target + '" --report-file "' + $reportFile + '"'
    if ($Isolated) { $setupArguments += ' --isolated-root "' + $TestRoot + '"' }
    $process = Start-Process -FilePath $SetupExe -ArgumentList $setupArguments -WindowStyle Hidden -Wait -PassThru
    $checks.installerExitZero = $process.ExitCode -eq 0
    if (-not $checks.installerExitZero) { throw (Get-Content -LiteralPath $reportFile -Raw -Encoding UTF8) }
    $state = Get-Content -LiteralPath (Join-Path $target '.price-query-install.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $report['applicationVersion'] = $state.version
    $report['installerRevision'] = $state.installerRevision
    $release = Get-Content -LiteralPath ([IO.Path]::ChangeExtension($SetupExe, '.release.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
    $checks.releaseIdentity = $state.installerRevision -eq $release.installerRevision -and $state.version -eq $release.applicationVersion -and $report.setupSha256 -eq $release.setupSha256 -and (Get-FileHash -LiteralPath $ExpectedApplicationExe).Hash -eq $release.applicationSha256
    if (-not $Isolated) { $registry = Get-ItemProperty -LiteralPath $registryKey }
    $app = Join-Path $target ($title + '.exe')
    $checks.installLocation = $state.installDirectory -eq $target -and ($Isolated -or $registry.InstallLocation -eq $target)
    $checks.payloadHash = (Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $ExpectedApplicationExe -Algorithm SHA256).Hash
    $shell = New-Object -ComObject WScript.Shell
    $checks.shortcuts = $state.shortcuts.Count -eq 3
    foreach ($link in $state.shortcuts) {
        $shortcut = $shell.CreateShortcut($link)
        $checks.shortcuts = $checks.shortcuts -and (Test-Path -LiteralPath $link) -and $shortcut.WorkingDirectory -eq $target
        if ($shortcut.TargetPath.EndsWith($title + '.exe')) {
            $checks.shortcuts = $checks.shortcuts -and $shortcut.TargetPath -eq $app
        } else {
            $checks.shortcuts = $checks.shortcuts -and $shortcut.Arguments.Contains('"' + (Join-Path $target 'Uninstall.ps1') + '"')
        }
    }
    $uninstaller = Join-Path $target 'Uninstall.ps1'
    if (-not $Isolated) { $checks.registeredUninstall = $registry.UninstallString.Contains('"' + $uninstaller + '"') }
    $data = Join-Path $target 'data'
    [IO.Directory]::CreateDirectory($data) | Out-Null
    $marker = Join-Path $data 'preserve.bin'
    [IO.File]::WriteAllBytes($marker, [byte[]](7, 9, 20, 26))
    $hash = (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash
    $extra = Join-Path $target 'personal.txt'
    [IO.File]::WriteAllText($extra, 'preserve unmanaged file', (New-Object Text.UTF8Encoding($false)))
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = if ($Isolated) { '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $uninstaller + '" -Quiet' } else { $registry.QuietUninstallString.Substring($registry.QuietUninstallString.IndexOf('"', 1) + 1).Trim() }
    $removed = Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
    $checks.uninstallExitZero = $removed.ExitCode -eq 0
    if (-not $Isolated) { $checks.registryRemoved = -not (Test-Path -LiteralPath $registryKey) }
    $checks.shortcutsRemoved = @($state.shortcuts | Where-Object { Test-Path -LiteralPath $_ }).Count -eq 0
    $checks.programRemoved = -not (Test-Path -LiteralPath $app)
    $checks.dataPreserved = (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash -eq $hash
    $checks.unmanagedPreserved = [IO.File]::ReadAllText($extra) -eq 'preserve unmanaged file'
    if (@($checks.Values | Where-Object { -not $_ }).Count) { throw 'One or more acceptance checks failed.' }
    $report.status = 'passed'
} catch {
    $report.status = 'failed'
    $report['failure'] = $_.Exception.Message
    throw
} finally {
    if ((Test-Path -LiteralPath (Join-Path $target 'Uninstall.ps1')) -and (Test-Path -LiteralPath (Join-Path $target '.price-query-install.json'))) {
        $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $cleanup = Start-Process -FilePath $powershell -ArgumentList ('-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $target 'Uninstall.ps1') + '" -Quiet') -WindowStyle Hidden -Wait -PassThru
        $report['cleanupExitCode'] = $cleanup.ExitCode
    }
    $json = $report | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText((Join-Path $TestRoot 'verification.json'), $json, (New-Object Text.UTF8Encoding($false)))
}
Write-Output $json
