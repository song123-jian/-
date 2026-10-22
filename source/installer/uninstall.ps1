param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$registryKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PriceQueryDesktop'
$package = $null

try {
    $root = [IO.Path]::GetFullPath($PSScriptRoot)
    $package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $statePath = Join-Path $root '.price-query-install.json'
    $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.productId -ne 'PriceQueryDesktop' -or $state.productId -ne $package.productId -or $state.installDirectory -ne $root) {
        throw 'The installation ownership check failed.'
    }
    foreach ($name in @($package.executableName, $package.shortcutName, $package.uninstallShortcutName)) {
        if (-not $name -or [IO.Path]::GetFileName($name) -ne $name) { throw 'Invalid package file name.' }
    }
    if ($state.isolatedRoot) {
        $isolated = [IO.Path]::GetFullPath($state.isolatedRoot)
        if (-not $root.StartsWith($isolated.TrimEnd('\', '/') + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Invalid isolated installation path.'
        }
        $menuRoot = Join-Path (Join-Path $isolated 'Start Menu') $package.displayName
        $desktopRoot = Join-Path $isolated 'Desktop'
    } else {
        $registeredRoot = if (Test-Path -LiteralPath $registryKey) { (Get-ItemProperty -LiteralPath $registryKey).InstallLocation } else { '' }
        if ($registeredRoot -ne $root) { throw 'The registered installation directory does not match this uninstaller.' }
        $menuRoot = Join-Path ([Environment]::GetFolderPath('Programs')) $package.displayName
        $desktopRoot = [Environment]::GetFolderPath('DesktopDirectory')
    }
    $ancestor = $root
    while ($ancestor) {
        $item = Get-Item -LiteralPath $ancestor -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to uninstall through a directory link.' }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    $appPath = Join-Path $root $package.executableName
    if (Test-Path -LiteralPath $appPath) {
        try {
            $stream = [IO.File]::Open($appPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
            $stream.Dispose()
        } catch { throw $package.runningMessage }
    }
    if (-not $Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        $answer = [Windows.Forms.MessageBox]::Show($package.uninstallPrompt, $package.displayName, 'YesNo', 'Question')
        if ($answer -ne [Windows.Forms.DialogResult]::Yes) { exit 0 }
    }
    $shell = New-Object -ComObject WScript.Shell
    $appLinks = @((Join-Path $menuRoot $package.shortcutName), (Join-Path $desktopRoot $package.shortcutName))
    foreach ($link in $appLinks) {
        if ((Test-Path -LiteralPath $link) -and $shell.CreateShortcut($link).TargetPath -eq $appPath) {
            Remove-Item -LiteralPath $link -Force
        }
    }
    $uninstallLink = Join-Path $menuRoot $package.uninstallShortcutName
    if (Test-Path -LiteralPath $uninstallLink) {
        $shortcut = $shell.CreateShortcut($uninstallLink)
        if ($shortcut.Arguments.Contains('"' + (Join-Path $root 'Uninstall.ps1') + '"')) {
            Remove-Item -LiteralPath $uninstallLink -Force
        }
    }
    if (-not $state.isolatedRoot -and (Test-Path -LiteralPath $registryKey)) {
        if ((Get-ItemProperty -LiteralPath $registryKey).InstallLocation -eq $root) {
            Remove-Item -LiteralPath $registryKey
        }
    }
    $managedFiles = @($package.executableName, 'app.ico', 'Uninstall.ps1', 'Uninstall.cmd', 'package.json')
    foreach ($name in $managedFiles) {
        $path = Join-Path $root $name
        if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
    }
    Remove-Item -LiteralPath $statePath -Force
    foreach ($path in @($menuRoot, $root)) {
        try { [IO.Directory]::Delete($path, $false) } catch [IO.IOException] { }
    }
    Write-Output ('UNINSTALL_OK_DATA_PRESERVED=' + (Join-Path $root 'data'))
    if (-not $Quiet) {
        [Windows.Forms.MessageBox]::Show($package.uninstalledMessage, $package.displayName, 'OK', 'Information') | Out-Null
    }
    exit 0
} catch {
    $failure = $_.Exception.Message
    if (-not $Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        $title = if ($package) { $package.displayName } else { [string][char]0x5DE5 + [char]0x4F5C }
        $prefix = if ($package) { $package.failedMessage } else { 'Uninstall failed: ' }
        [Windows.Forms.MessageBox]::Show(($prefix + $failure), $title, 'OK', 'Error') | Out-Null
    }
    Write-Error $failure
    exit 1
}
