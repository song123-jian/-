param(
    [string]$ApplicationExe = '',
    [string]$OutputDirectory = '',
    [string]$InstallerRevision = 'r9',
    [string]$CompilerPath = '',
    [string]$TestIdentity = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$template = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'installer\package-template.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($InstallerRevision -notmatch '^r[1-9][0-9]{0,5}$') { throw 'InstallerRevision must be r followed by a positive integer (up to six digits).' }
if ($TestIdentity -and $TestIdentity -notmatch '^qa-[a-f0-9]{32}$') { throw 'TestIdentity must be qa- followed by 32 lowercase hexadecimal digits.' }
$versionMatch = [regex]::Match((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'domain.py') -Raw -Encoding UTF8), '(?m)^VERSION = "([0-9.]+)"')
if (-not $versionMatch.Success) { throw 'Could not read the application version.' }
$version = $versionMatch.Groups[1].Value
if (-not $ApplicationExe) { $ApplicationExe = Join-Path (Join-Path $projectRoot ('work\release-work-' + $version)) $template.executableName }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot ('work\release-native-installer-' + $version + '-' + $InstallerRevision) }
$ApplicationExe = (Resolve-Path -LiteralPath $ApplicationExe).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$appHash = (Get-FileHash -LiteralPath $ApplicationExe -Algorithm SHA256).Hash
if (-not $TestIdentity) {
    $applicationRecord = Join-Path (Split-Path -Parent $ApplicationExe) 'build-verification.json'
    if (-not (Test-Path -LiteralPath $applicationRecord -PathType Leaf)) { throw 'A matching build-verification.json is required for a production package.' }
    $record = Get-Content -LiteralPath $applicationRecord -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($record.applicationSha256 -ne $appHash -or $record.applicationVersion -ne $version -or $record.applicationEntry -ne 'desktop_main.py') {
        throw 'Application build identity does not match the payload, version, or desktop entry point.'
    }
}
if (-not $CompilerPath) { $CompilerPath = $env:PRICEQUERY_ISCC }
if (-not $CompilerPath) { $CompilerPath = Join-Path $projectRoot '.build\toolchain\inno-6.7.3\compiler\ISCC.exe' }
if (-not (Test-Path -LiteralPath $CompilerPath -PathType Leaf)) { throw 'Inno Setup 6 compiler not found. Pass -CompilerPath or set PRICEQUERY_ISCC.' }
$CompilerPath = (Resolve-Path -LiteralPath $CompilerPath).Path
$appId = $template.productId
$displayName = $template.displayName
$groupName = $template.displayName + ([string][char]0x684C) + [char]0x9762 + [char]0x7AEF
$defaultDirName = '{localappdata}\Programs\PriceQueryDesktop'
$suffix = ''
if ($TestIdentity) {
    $appId += '.' + $TestIdentity
    $displayName += ' QA ' + $TestIdentity
    $groupName = $displayName
    $defaultDirName = Join-Path $OutputDirectory ('qa-install-' + $TestIdentity)
    $suffix = '-' + $TestIdentity
}
$setupName = $template.displayName + '-' + $version + '-' + $InstallerRevision + $suffix + '-Setup.exe'
$setupPath = Join-Path $OutputDirectory $setupName
$releasePath = [IO.Path]::ChangeExtension($setupPath, '.release.json')
if ((Test-Path -LiteralPath $setupPath) -or (Test-Path -LiteralPath $releasePath)) { throw ('Installer output already exists: ' + $setupPath) }
$stage = Join-Path $projectRoot ('.build\setup-native-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $stage 'payload'
[IO.Directory]::CreateDirectory($payload) | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$manifestFiles = @()
foreach ($file in @(
    @{ source = $ApplicationExe; target = $template.executableName },
    @{ source = (Join-Path $PSScriptRoot 'assets\app-icon.ico'); target = 'app.ico' }
)) {
    $destination = Join-Path $payload $file.target
    Copy-Item -LiteralPath $file.source -Destination $destination
    $manifestFiles += [ordered]@{ target = $file.target; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash }
}
$infoPath = Join-Path $payload 'install-info.ini'
[IO.File]::WriteAllText($infoPath, ("[Setup]`r`nProductId=$appId`r`nVersion=$version`r`nInstallerRevision=$InstallerRevision`r`n"), $utf8)
$manifestFiles += [ordered]@{ target = 'install-info.ini'; sha256 = (Get-FileHash -LiteralPath $infoPath -Algorithm SHA256).Hash }
$release = [ordered]@{
    schemaVersion = 2
    createdAt = [DateTimeOffset]::Now.ToString('o')
    productId = $template.productId
    appId = $appId
    applicationVersion = $version
    installerRevision = $InstallerRevision
    installerEngine = 'Inno Setup'
    isTestPackage = [bool]$TestIdentity
    setupFile = $setupName
    applicationFile = $template.executableName
    applicationSha256 = $appHash
    applicationEntry = 'desktop_main.py'
    compilerSha256 = (Get-FileHash -LiteralPath $CompilerPath -Algorithm SHA256).Hash
    files = $manifestFiles
    verificationStatus = 'not_run'
}
[IO.File]::WriteAllText((Join-Path $payload 'installer-release.json'), ($release | ConvertTo-Json -Depth 6), $utf8)
$compileArgs = @(
    '/Qp', ('/O' + $stage), '/Fsetup',
    ('/DAppId=' + $appId), ('/DAppVersion=' + $version),
    ('/DInstallerRevision=' + $InstallerRevision), ('/DAppName=' + $displayName),
    ('/DGroupName=' + $groupName), ('/DDefaultDirName=' + $defaultDirName),
    ('/DAppExeName=' + $template.executableName),
    ('/DPayloadDir=' + $payload), (Join-Path $PSScriptRoot 'installer\PriceQuery.iss')
)
$compilerOutput = & $CompilerPath @compileArgs 2>&1
$compilerExit = $LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $stage 'compiler.log'), ($compilerOutput -join "`r`n"), $utf8)
if ($compilerExit -ne 0) { throw ('Inno Setup compilation failed: ' + ($compilerOutput -join "`n")) }
$builtSetup = Join-Path $stage 'setup.exe'
if (-not (Test-Path -LiteralPath $builtSetup -PathType Leaf)) { throw 'The compiler did not generate setup.exe.' }
$release['setupSha256'] = (Get-FileHash -LiteralPath $builtSetup -Algorithm SHA256).Hash
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
# Never replace an existing release, including when two builds target the same name.
$publishId = [guid]::NewGuid().ToString('N')
$stagedSetupPath = $setupPath + '.' + $publishId + '.tmp'
$stagedReleasePath = $releasePath + '.' + $publishId + '.tmp'
$stagedSetupCreated = $false
$stagedReleaseCreated = $false
$publishedSetup = $false
$publishedRelease = $false
try {
    $sourceStream = [IO.File]::OpenRead($builtSetup)
    $stagedSetupStream = [IO.File]::Open($stagedSetupPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stagedSetupCreated = $true
    try { $sourceStream.CopyTo($stagedSetupStream) } finally {
        $stagedSetupStream.Dispose()
        $sourceStream.Dispose()
    }
    $stagedReleaseStream = [IO.File]::Open($stagedReleasePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $stagedReleaseCreated = $true
    $writer = New-Object IO.StreamWriter($stagedReleaseStream, $utf8)
    try { $writer.Write(($release | ConvertTo-Json -Depth 6)) } finally { $writer.Dispose() }
    [IO.File]::Move($stagedSetupPath, $setupPath)
    $stagedSetupCreated = $false
    $publishedSetup = $true
    [IO.File]::Move($stagedReleasePath, $releasePath)
    $stagedReleaseCreated = $false
    $publishedRelease = $true
} catch {
    if ($publishedSetup -and -not $publishedRelease) {
        try { [IO.File]::Delete($setupPath) } catch { Write-Warning ('Could not roll back staged Setup: ' + $_.Exception.Message) }
    }
    throw
} finally {
    if ($stagedSetupCreated) {
        try { [IO.File]::Delete($stagedSetupPath) } catch { Write-Warning ('Could not remove temporary Setup: ' + $_.Exception.Message) }
    }
    if ($stagedReleaseCreated) {
        try { [IO.File]::Delete($stagedReleasePath) } catch { Write-Warning ('Could not remove temporary release record: ' + $_.Exception.Message) }
    }
}
Write-Output ('INSTALLER_STAGE=' + $stage)
Write-Output ('SETUP_EXE=' + $setupPath)
Write-Output ('SETUP_SHA256=' + $release.setupSha256)
Write-Output ('RELEASE_JSON=' + $releasePath)
