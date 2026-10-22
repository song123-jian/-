# Historical installer retained only for legacy regression and recovery.
param([string]$ApplicationExe = '', [string]$OutputDirectory = '', [string]$InstallerRevision = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$template = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'installer\package-template.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $ApplicationExe) { $ApplicationExe = Join-Path $projectRoot ('work\release-work\' + $template.executableName) }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'work\release-work' }
$ApplicationExe = (Resolve-Path -LiteralPath $ApplicationExe).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$framework = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The Windows .NET Framework compiler is not available.' }
$versionMatch = [regex]::Match((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'domain.py') -Raw -Encoding UTF8), '(?m)^VERSION = "([0-9.]+)"')
if (-not $versionMatch.Success) { throw 'Could not read the application version.' }
$template.version = $versionMatch.Groups[1].Value
if ($InstallerRevision) { $template.installerRevision = $InstallerRevision }
if ($template.installerRevision -notmatch '^r[1-9][0-9]{0,5}$') { throw 'InstallerRevision must be r followed by a positive integer (up to six digits).' }
$setupName = $template.displayName + '-' + $template.version + '-' + $template.installerRevision + '-Setup.exe'
$setupPath = Join-Path $OutputDirectory $setupName
$releasePath = [IO.Path]::ChangeExtension($setupPath, '.release.json')
if ((Test-Path -LiteralPath $setupPath) -or (Test-Path -LiteralPath $releasePath)) { throw ('Installer output already exists: ' + $setupPath) }
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$stage = Join-Path $projectRoot ('.build\setup-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $stage 'payload'
[IO.Directory]::CreateDirectory($payload) | Out-Null
$sourceFiles = @(
    @{ source = $ApplicationExe; name = 'app.exe'; target = $template.executableName },
    @{ source = (Join-Path $PSScriptRoot 'assets\app-icon.ico'); name = 'app.ico'; target = 'app.ico' },
    @{ source = (Join-Path $PSScriptRoot 'installer\uninstall.ps1'); name = 'uninstall.ps1'; target = 'Uninstall.ps1' },
    @{ source = (Join-Path $PSScriptRoot 'installer\uninstall.cmd'); name = 'uninstall.cmd'; target = 'Uninstall.cmd' }
)
$manifestFiles = @()
foreach ($file in $sourceFiles) {
    $destination = Join-Path $payload $file.name
    Copy-Item -LiteralPath $file.source -Destination $destination
    $manifestFiles += [ordered]@{ source = $file.name; target = $file.target; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash }
}
$template | Add-Member -MemberType NoteProperty -Name files -Value $manifestFiles
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $payload 'package.json'), ($template | ConvertTo-Json -Depth 5), $utf8)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'installer\install.ps1') -Destination (Join-Path $payload 'install.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $stage 'payload.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($payload, $zip, [IO.Compression.CompressionLevel]::NoCompression, $false)
$versionSource = '[assembly: System.Reflection.AssemblyTitle("工作安装程序")]' + "`r`n" +
    '[assembly: System.Reflection.AssemblyFileVersion("' + $template.version + '.0")]' + "`r`n"
$versionFile = Join-Path $stage 'version.cs'
[IO.File]::WriteAllText($versionFile, $versionSource, $utf8)
$builtSetup = Join-Path $stage 'setup.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 `
    ('/out:' + $builtSetup) ('/win32icon:' + (Join-Path $PSScriptRoot 'assets\app-icon.ico')) `
    ('/win32manifest:' + (Join-Path $PSScriptRoot 'installer\setup.manifest')) `
    ('/reference:' + (Join-Path $framework 'System.IO.Compression.dll')) `
    ('/reference:' + (Join-Path $framework 'System.IO.Compression.FileSystem.dll')) `
    ('/reference:' + (Join-Path $framework 'System.Windows.Forms.dll')) `
    ('/reference:' + (Join-Path $framework 'System.Drawing.dll')) `
    ('/resource:' + $zip + ',PriceQueryPackage.zip') `
    (Join-Path $PSScriptRoot 'installer\SetupBootstrap.cs') $versionFile
if ($LASTEXITCODE -ne 0) { throw ('Installer compilation failed: ' + $LASTEXITCODE) }
if (-not (Test-Path -LiteralPath $builtSetup -PathType Leaf)) { throw 'The compiler did not generate setup.exe.' }
[IO.File]::Copy($builtSetup, $setupPath, $false)
$release = [ordered]@{
    schemaVersion = 1
    createdAt = [DateTimeOffset]::Now.ToString('o')
    productId = $template.productId
    applicationVersion = $template.version
    installerRevision = $template.installerRevision
    setupFile = $setupName
    setupSha256 = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash
    applicationFile = $template.executableName
    applicationSha256 = $manifestFiles[0].sha256
    applicationEntry = 'desktop_main.py'
    files = $manifestFiles
    verificationStatus = 'not_run'
}
[IO.File]::WriteAllText($releasePath, ($release | ConvertTo-Json -Depth 6), $utf8)
Write-Output ('INSTALLER_STAGE=' + $stage)
Write-Output ('SETUP_EXE=' + $setupPath)
Write-Output ('SETUP_BYTES=' + (Get-Item -LiteralPath $setupPath).Length)
Write-Output ('SETUP_SHA256=' + (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash)
Write-Output ('RELEASE_JSON=' + $releasePath)
