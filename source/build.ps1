param([string]$Python = '', [string]$OutputDirectory = '', [switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$versionMatch = [regex]::Match((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'domain.py') -Raw -Encoding UTF8), '(?m)^VERSION = "([0-9.]+)"')
if (-not $versionMatch.Success) { throw 'Could not read the application version.' }
$version = $versionMatch.Groups[1].Value
$applicationBaseName = ([string][char]0x5DE5) + [char]0x4F5C
$applicationFileName = $applicationBaseName + '.exe'
if (-not $Python) { $Python = Join-Path $projectRoot '.venv\Scripts\python.exe' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot ('work\release-work-' + $version) }
$Python = (Resolve-Path -LiteralPath $Python).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$applicationPath = Join-Path $OutputDirectory $applicationFileName
$recordPath = Join-Path $OutputDirectory 'build-verification.json'
if ((Test-Path -LiteralPath $applicationPath) -or (Test-Path -LiteralPath $recordPath)) { throw 'Build output already exists; use a new output directory.' }
$buildRoot = Join-Path $projectRoot ('.build\desktop-' + [guid]::NewGuid().ToString('N'))
$buildSource = Join-Path $buildRoot 'source'
[IO.Directory]::CreateDirectory($buildSource) | Out-Null
$legacyModules = @('app.py', 'supabase_backend.py')
$sourceFiles = @(Get-ChildItem -LiteralPath $PSScriptRoot -File |
    Where-Object { $_.Name -notin $legacyModules })
foreach ($module in @('assets', 'business_templates', 'services', 'storage', 'ui', 'migrations', 'static')) {
    $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot $module) -File -Recurse |
        Where-Object { $_.FullName -notmatch '[\\/](__pycache__|\.pytest_cache|\.ruff_cache)[\\/]' -and $_.Extension -ne '.pyc' }
}
foreach ($file in $sourceFiles) {
    $relative = $file.FullName.Substring($PSScriptRoot.Length + 1)
    $destination = Join-Path $buildSource $relative
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination
}
foreach ($module in $legacyModules) {
    if (Test-Path -LiteralPath (Join-Path $buildSource $module)) {
        throw ('Deprecated module must not enter the frozen source snapshot: ' + $module)
    }
}
& $Python (Join-Path $buildSource 'build_app_icon.py')
if ($LASTEXITCODE -ne 0) { throw 'App icon generation failed' }
$accountAssets = Join-Path $buildRoot 'account-assets'
New-Item -ItemType Directory -Path $accountAssets -Force | Out-Null
$accountSeed = Join-Path $accountAssets 'seed.json'
Copy-Item -LiteralPath (Join-Path $buildSource 'account_seed.json') -Destination $accountSeed
$rcc = Join-Path (Split-Path -Parent $Python) 'pyside6-rcc.exe'
if (Get-Command node -ErrorAction SilentlyContinue) {
    & node (Join-Path $buildSource 'build_icons.js')
    if ($LASTEXITCODE -ne 0) { throw 'UI icon generation failed' }
}
& $rcc (Join-Path $buildSource 'resources.qrc') -o (Join-Path $buildSource 'ui\resources_rc.py')
if ($LASTEXITCODE -ne 0) { throw 'Qt resource compilation failed' }
if (-not $SkipTests) {
    & $Python -m ruff check $PSScriptRoot
    if ($LASTEXITCODE -ne 0) { throw 'Static review failed' }
    $previousPlatform = $env:QT_QPA_PLATFORM
    try {
        $env:QT_QPA_PLATFORM = 'offscreen'
        & $Python -m pytest (Join-Path $PSScriptRoot 'tests') -q --tb=short ('--junitxml=' + (Join-Path $buildRoot 'tests.xml'))
        if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed' }
    } finally {
        $env:QT_QPA_PLATFORM = $previousPlatform
    }
}
& $Python -m PyInstaller --noconfirm --clean --onefile --windowed `
    --name $applicationBaseName --distpath $OutputDirectory `
    --workpath (Join-Path $buildRoot 'desktop-work') --specpath $buildRoot `
    --paths $buildSource --exclude-module PySide6.QtWebEngineCore `
    --exclude-module PySide6.QtWebEngineWidgets --exclude-module PySide6.QtPdf `
    --collect-data rapidocr --hidden-import rapidocr.inference_engine.onnxruntime `
    --icon (Join-Path $buildSource 'assets\app-icon.ico') `
    --add-data ($accountSeed + ';.') `
    --add-data ((Join-Path $buildSource 'account_config.json') + ';.') `
    --add-data ((Join-Path $buildSource 'supabase.sql') + ';.') `
    --add-data ((Join-Path $buildSource 'migrations') + ';migrations') `
    --add-data ((Join-Path $buildSource 'business_templates') + ';business_templates') `
    (Join-Path $buildSource 'desktop_main.py')
if ($LASTEXITCODE -ne 0) { throw 'Desktop EXE build failed' }
$snapshotVersionMatch = [regex]::Match((Get-Content -LiteralPath (Join-Path $buildSource 'domain.py') -Raw -Encoding UTF8), '(?m)^VERSION = "([0-9.]+)"')
if (-not $snapshotVersionMatch.Success -or $snapshotVersionMatch.Groups[1].Value -ne $version) { throw 'Application version changed during the build.' }
$verification = [ordered]@{
    schemaVersion = 1
    createdAt = [DateTimeOffset]::Now.ToString('o')
    applicationVersion = $version
    applicationEntry = 'desktop_main.py'
    applicationFile = $applicationFileName
    applicationSha256 = (Get-FileHash -LiteralPath $applicationPath -Algorithm SHA256).Hash
    python = $Python
    buildRoot = $buildRoot
    checks = if ($SkipTests) { 'skipped by explicit switch' } else { 'ruff and pytest passed' }
    testReport = if ($SkipTests) { $null } else { Join-Path $buildRoot 'tests.xml' }
    excludedLegacyModules = $legacyModules
    actualProgramVerification = 'not_run'
}
[IO.File]::WriteAllText($recordPath, ($verification | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
Write-Output $applicationPath
Write-Output ('BUILD_JSON=' + $recordPath)
