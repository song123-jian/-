param([switch]$Quiet, [string]$IsolatedRoot = '', [string]$InstallDirectory = '')
$ErrorActionPreference = 'Stop'
$registryKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PriceQueryDesktop'
$createdFiles = @()
$createdShortcuts = @()
$registryCreated = $false
$installRoot = ''
$menuRoot = ''
$package = $null
$installRootCreated = $false
$menuRootCreated = $false

function Get-PackageHash([string]$Path) {
    $sha256 = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha256.Dispose() }
}

function Save-Utf8([string]$Path, [string]$Content) {
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($Content)
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}

function Remove-EmptyDirectory([string]$Path) {
    if ($Path -and [IO.Directory]::Exists($Path)) {
        try { [IO.Directory]::Delete($Path, $false) } catch [IO.IOException] { }
    }
}

function Resolve-InstallDirectory([string]$Path) {
    if ($Path -notmatch '^[A-Za-z]:[\\/]') {
        throw 'Choose an absolute local drive path; network and relative paths are not supported.'
    }
    foreach ($part in ($Path.Substring(3) -split '[\\/]')) {
        if ($part -match '[. ]$|[<>:"|?*\x00-\x1f]' -or $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') {
            throw 'The installation path contains an invalid Windows folder name.'
        }
    }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\', '/')) {
        throw 'Choose a dedicated installation folder, not a drive root.'
    }
    if ($full.Length -gt 200) { throw 'Choose an installation path of at most 200 characters.' }
    foreach ($protected in @($env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData)) {
        if ($protected) {
            $protected = [IO.Path]::GetFullPath($protected).TrimEnd('\', '/')
            if ($full -eq $protected -or $full.StartsWith($protected + '\', [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Choose a user-writable folder outside Windows and protected program directories.'
            }
        }
    }
    $ancestor = $full
    while ($ancestor) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                throw 'The installation path must not contain files or directory links.'
            }
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    return $full
}

try {
    $package = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.productId -ne 'PriceQueryDesktop' -or $package.executableName -ne ($package.displayName + '.exe')) {
        throw 'Invalid installer package.'
    }
    foreach ($name in @($package.executableName, $package.shortcutName, $package.uninstallShortcutName)) {
        if (-not $name -or [IO.Path]::GetFileName($name) -ne $name) { throw 'Invalid package file name.' }
    }
    if ($IsolatedRoot) {
        $IsolatedRoot = [IO.Path]::GetFullPath($IsolatedRoot)
        if ($IsolatedRoot.TrimEnd('\') -eq [IO.Path]::GetPathRoot($IsolatedRoot).TrimEnd('\')) {
            throw 'The isolated test directory must not be a drive root.'
        }
        $installRoot = Join-Path $IsolatedRoot 'Programs\PriceQueryDesktop'
        $menuRoot = Join-Path (Join-Path $IsolatedRoot 'Start Menu') $package.displayName
        $desktopRoot = Join-Path $IsolatedRoot 'Desktop'
    } else {
        $installRoot = Join-Path $env:LOCALAPPDATA 'Programs\PriceQueryDesktop'
        $menuRoot = Join-Path ([Environment]::GetFolderPath('Programs')) $package.displayName
        $desktopRoot = [Environment]::GetFolderPath('DesktopDirectory')
    }
    if ($InstallDirectory) { $installRoot = $InstallDirectory }
    $installRoot = Resolve-InstallDirectory $installRoot
    if ($IsolatedRoot) {
        $boundary = $IsolatedRoot.TrimEnd('\', '/') + '\'
        if (-not $installRoot.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'An isolated installation must remain inside its test directory.'
        }
    }
    if (Test-Path -LiteralPath $installRoot) {
        $item = Get-Item -LiteralPath $installRoot -Force
        if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'The installation directory must be a regular directory.'
        }
        $unexpected = @(Get-ChildItem -LiteralPath $installRoot -Force | Where-Object { $_.Name -ne 'data' -or -not $_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) })
        if ($unexpected.Count) { throw $package.existingInstallationMessage }
    }
    $appLink = Join-Path $menuRoot $package.shortcutName
    $removeLink = Join-Path $menuRoot $package.uninstallShortcutName
    $desktopLink = Join-Path $desktopRoot $package.shortcutName
    foreach ($link in @($appLink, $removeLink, $desktopLink)) {
        if (Test-Path -LiteralPath $link) { throw $package.existingInstallationMessage }
    }
    if (-not $IsolatedRoot -and (Test-Path -LiteralPath $registryKey)) {
        throw $package.existingInstallationMessage
    }
    foreach ($file in $package.files) {
        if ([IO.Path]::GetFileName($file.source) -ne $file.source -or [IO.Path]::GetFileName($file.target) -ne $file.target) {
            throw 'Invalid package file name.'
        }
        $hash = Get-PackageHash (Join-Path $PSScriptRoot $file.source)
        if ($hash -ne $file.sha256) { throw ('Package integrity check failed: ' + $file.source) }
    }
    if (-not $Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        $prompt = $package.installPrompt.Replace('{path}', $installRoot)
        $answer = [Windows.Forms.MessageBox]::Show($prompt, $package.displayName, 'YesNo', 'Question')
        if ($answer -ne [Windows.Forms.DialogResult]::Yes) { exit 0 }
    }
    $installRootCreated = -not [IO.Directory]::Exists($installRoot)
    [IO.Directory]::CreateDirectory($installRoot) | Out-Null
    $probe = Join-Path $installRoot ('.write-test-' + [guid]::NewGuid().ToString('N'))
    try { Save-Utf8 $probe 'write-access-check' }
    catch { throw 'The installation folder is not writable. Choose another folder; administrator rights are not requested.' }
    finally { if ([IO.File]::Exists($probe)) { [IO.File]::Delete($probe) } }
    foreach ($file in $package.files) {
        $target = Join-Path $installRoot $file.target
        [IO.File]::Copy((Join-Path $PSScriptRoot $file.source), $target, $false)
        $createdFiles += $target
        if ((Get-PackageHash $target) -ne $file.sha256) {
            throw ('Installed file verification failed: ' + $file.target)
        }
    }
    $installedPackage = Join-Path $installRoot 'package.json'
    [IO.File]::Copy((Join-Path $PSScriptRoot 'package.json'), $installedPackage, $false)
    $createdFiles += $installedPackage
    $menuRootCreated = -not [IO.Directory]::Exists($menuRoot)
    [IO.Directory]::CreateDirectory($menuRoot) | Out-Null
    [IO.Directory]::CreateDirectory($desktopRoot) | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $appPath = Join-Path $installRoot $package.executableName
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($path in @($appLink, $desktopLink)) {
        $shortcut = $shell.CreateShortcut($path)
        $shortcut.TargetPath = $appPath
        $shortcut.WorkingDirectory = $installRoot
        $shortcut.IconLocation = (Join-Path $installRoot 'app.ico') + ',0'
        $shortcut.Description = $package.displayName
        $shortcut.Save()
        $createdShortcuts += $path
    }
    $uninstallScript = Join-Path $installRoot 'Uninstall.ps1'
    $shortcut = $shell.CreateShortcut($removeLink)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $uninstallScript + '"'
    $shortcut.WorkingDirectory = $installRoot
    $shortcut.IconLocation = (Join-Path $installRoot 'app.ico') + ',0'
    $shortcut.Save()
    $createdShortcuts += $removeLink
    $state = [ordered]@{
        productId = $package.productId
        version = $package.version
        installerRevision = $package.installerRevision
        schemaVersion = 2
        installDirectory = $installRoot
        isolatedRoot = $IsolatedRoot
        shortcuts = $createdShortcuts
        files = @($package.files | ForEach-Object { $_.target }) + @('package.json')
    }
    $statePath = Join-Path $installRoot '.price-query-install.json'
    Save-Utf8 $statePath ($state | ConvertTo-Json -Depth 5)
    $createdFiles += $statePath
    if (-not $IsolatedRoot) {
        New-Item -Path $registryKey -ErrorAction Stop | Out-Null
        $registryCreated = $true
        $command = '"' + $powershell + '" -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $uninstallScript + '"'
        $properties = @{
            DisplayName = $package.displayName
            DisplayVersion = $package.version
            InstallLocation = $installRoot
            DisplayIcon = (Join-Path $installRoot 'app.ico')
            UninstallString = $command
            QuietUninstallString = $command + ' -Quiet'
            Publisher = $package.displayName
        }
        foreach ($name in $properties.Keys) {
            New-ItemProperty -Path $registryKey -Name $name -Value $properties[$name] -PropertyType String -Force | Out-Null
        }
        foreach ($name in @('NoModify', 'NoRepair')) {
            New-ItemProperty -Path $registryKey -Name $name -Value 1 -PropertyType DWord -Force | Out-Null
        }
    }
    Write-Output ('INSTALL_OK=' + $installRoot)
    if (-not $Quiet) {
        $answer = [Windows.Forms.MessageBox]::Show($package.installedMessage, $package.displayName, 'YesNo', 'Information')
        if ($answer -eq [Windows.Forms.DialogResult]::Yes) {
            Start-Process -FilePath $appPath -WorkingDirectory $installRoot
        }
    }
    exit 0
} catch {
    $failure = $_.Exception.Message
    if ($registryCreated) {
        Remove-Item -LiteralPath $registryKey -ErrorAction SilentlyContinue
    }
    foreach ($path in $createdShortcuts) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
    foreach ($path in $createdFiles) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
    if ($menuRootCreated) { Remove-EmptyDirectory $menuRoot }
    if ($installRootCreated) { Remove-EmptyDirectory $installRoot }
    if (-not $Quiet) {
        Add-Type -AssemblyName System.Windows.Forms
        $title = if ($package) { $package.displayName } else { [string][char]0x5DE5 + [char]0x4F5C }
        $prefix = if ($package) { $package.failedMessage } else { 'Installation failed: ' }
        [Windows.Forms.MessageBox]::Show(($prefix + $failure), $title, 'OK', 'Error') | Out-Null
    }
    Write-Error $failure
    exit 1
}
