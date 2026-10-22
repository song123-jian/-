param(
    [Parameter(Mandatory = $true)][string]$ApplicationExe,
    [Parameter(Mandatory = $true)][string]$ShortcutPath,
    [string]$IconPath = '',
    [Parameter(Mandatory = $true)][string]$ApplicationVersion
)
$ErrorActionPreference = 'Stop'
if ($ApplicationVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') { throw 'ApplicationVersion must use MAJOR.MINOR.PATCH.' }
$ApplicationExe = (Resolve-Path -LiteralPath $ApplicationExe).Path
if (-not $IconPath) {
    $iconName = [string][char]0x5DE5 + [char]0x4F5C + [char]0x56FE + [char]0x6807 + '.ico'
    $IconPath = Join-Path (Split-Path -Parent $ShortcutPath) $iconName
    if (-not (Test-Path -LiteralPath $IconPath -PathType Leaf)) { $IconPath = $ApplicationExe }
}
$IconPath = (Resolve-Path -LiteralPath $IconPath).Path
$ShortcutPath = [IO.Path]::GetFullPath($ShortcutPath)
$ShortcutDirectory = Split-Path -Parent $ShortcutPath
if (-not (Test-Path -LiteralPath $ShortcutDirectory -PathType Container)) { throw 'Shortcut directory does not exist.' }
$WorkingDirectory = Split-Path -Parent $ApplicationExe
$Description = ([string][char]0x542F + [char]0x52A8 + [char]0x5DE5 + [char]0x4F5C + ' ' +
    $ApplicationVersion + [char]0xFF08 + [char]0x4F7F + [char]0x7528 + ' EXE ' +
    [char]0x540C + [char]0x7EA7 + ' data' + [char]0xFF09)
$publishId = [guid]::NewGuid().ToString('N')
$TemporaryShortcut = $ShortcutPath + '.' + $publishId + '.tmp.lnk'
$BackupShortcut = $ShortcutPath + '.' + $publishId + '.bak.lnk'
$shell = New-Object -ComObject WScript.Shell
try {
    $link = $shell.CreateShortcut($TemporaryShortcut)
    $link.TargetPath = $ApplicationExe
    $link.WorkingDirectory = $WorkingDirectory
    $link.Arguments = ''
    $link.IconLocation = $IconPath + ',0'
    $link.Description = $Description
    $link.Save()
    $link = $null

    $verified = $shell.CreateShortcut($TemporaryShortcut)
    $valid = [StringComparer]::OrdinalIgnoreCase.Equals($verified.TargetPath, $ApplicationExe) -and
        [StringComparer]::OrdinalIgnoreCase.Equals($verified.WorkingDirectory, $WorkingDirectory) -and
        $verified.Arguments -eq '' -and
        [StringComparer]::OrdinalIgnoreCase.Equals($verified.IconLocation, ($IconPath + ',0')) -and
        $verified.Description -eq $Description
    $state = [ordered]@{
        targetPath = $verified.TargetPath
        workingDirectory = $verified.WorkingDirectory
        arguments = $verified.Arguments
        iconLocation = $verified.IconLocation
        description = $verified.Description
    }
    $verified = $null
    if (-not $valid) { throw 'The staged shortcut did not match the requested launch settings.' }

    if (Test-Path -LiteralPath $ShortcutPath -PathType Leaf) {
        [IO.File]::Replace($TemporaryShortcut, $ShortcutPath, $BackupShortcut)
        [IO.File]::Delete($BackupShortcut)
    } else {
        [IO.File]::Move($TemporaryShortcut, $ShortcutPath)
    }
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    Write-Output ('SHORTCUT_JSON=' + ($state | ConvertTo-Json -Compress -Depth 3))
} finally {
    if (Test-Path -LiteralPath $TemporaryShortcut -PathType Leaf) {
        [IO.File]::Delete($TemporaryShortcut)
    }
    if ($shell) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
}
