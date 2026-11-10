# Build the original IWXA Setup Core with an Atlas product profile, native
# blue icon and exact source revision. No installer code is forked into Atlas.
[CmdletBinding()]
param(
    [string]$SetupCoreRoot = "setup-core-source",
    [string]$Output = "artifacts/IWXA-Atlas-0.6.0-dev.1-Setup.exe",
    [switch]$InstallForQualification
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$atlas = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$core = if ([IO.Path]::IsPathRooted($SetupCoreRoot)) {
    [IO.Path]::GetFullPath($SetupCoreRoot)
} else {
    [IO.Path]::GetFullPath((Join-Path $atlas $SetupCoreRoot))
}
$outputPath = if ([IO.Path]::IsPathRooted($Output)) {
    [IO.Path]::GetFullPath($Output)
} else {
    [IO.Path]::GetFullPath((Join-Path $atlas $Output))
}
$build = Join-Path $core 'installer/build_bundle.py'
$stubBuilder = Join-Path $core 'installer/windows/build-stub.ps1'
$profile = Join-Path $PSScriptRoot 'atlas.json'
$icon = Join-Path $atlas 'desktop/src-tauri/icons/icon.ico'
$exe = Join-Path $atlas 'desktop/src-tauri/target/release/iwxa-atlas-desktop.exe'
foreach ($file in @($build,$stubBuilder,$profile,$icon,$exe)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "ATLAS_SETUP_INPUT_MISSING $file"
    }
}
$product = Get-Content -LiteralPath $profile -Raw | ConvertFrom-Json
$tauri = Get-Content -LiteralPath (Join-Path $atlas 'desktop/src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
if ($product.id -ne 'iwxa.atlas' -or $product.data_namespace -ne $tauri.identifier -or
    $product.version -ne $tauri.version -or $product.entrypoint -ne 'iwxa-atlas-desktop.exe' -or
    $product.install_dir -ne 'IWXA Atlas' -or $product.architecture -ne 'windows-x64') {
    throw 'ATLAS_SETUP_PRODUCT_IDENTITY_MISMATCH'
}
$head = [string](& git -C $atlas rev-parse HEAD)
$tree = [string](& git -C $atlas rev-parse 'HEAD^{tree}')
$head = $head.Trim()
$tree = $tree.Trim()
if ($head -notmatch '^[0-9a-f]{40}$' -or $tree -notmatch '^[0-9a-f]{40}$') {
    throw 'ATLAS_SETUP_SOURCE_REVISION_MISSING'
}
$temporary = Join-Path $env:RUNNER_TEMP ('atlas-setup-' + [Guid]::NewGuid().ToString('N'))
$payload = Join-Path $temporary 'payload'
New-Item -ItemType Directory -Path $payload -Force | Out-Null
try {
    Copy-Item -LiteralPath $exe -Destination (Join-Path $payload $product.entrypoint) -Force
    $stub = Join-Path $temporary 'iwxa-setup-core-stub.exe'
    & $stubBuilder -Output $stub -Icon $icon
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $stub -PathType Leaf)) {
        throw 'ATLAS_SETUP_CORE_STUB_BUILD_FAILED'
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $outputPath) -Force | Out-Null
    $arguments = @(
        $build, 'build-resource', '--product', $profile, '--payload', $payload,
        '--stub', $stub, '--output', $outputPath,
        '--source-commit', $head, '--source-tree', $tree
    )
    $result = & python @arguments
    if ($LASTEXITCODE -ne 0) { throw 'ATLAS_SETUP_CORE_PACKAGE_BUILD_FAILED' }
    $receipt = ($result | Out-String) | ConvertFrom-Json
    if ($receipt.status -ne 'VERIFIED' -or $receipt.product -ne $product.id -or
        $receipt.version -ne $product.version -or $receipt.format -ne 'PE_RESOURCE_V2' -or
        $receipt.source.commit -ne $head -or $receipt.source.tree -ne $tree) {
        throw 'ATLAS_SETUP_CORE_PACKAGE_METADATA_INVALID'
    }
    function Inspect([string]$operation, [string]$target) {
        $p = Start-Process -FilePath $outputPath -ArgumentList ('{0} "{1}"' -f $operation,$target) -PassThru
        try {
            if (!$p.WaitForExit(90000)) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                throw "ATLAS_SETUP_CORE_TIMEOUT $operation"
            }
            if ($p.ExitCode -ne 0) { throw "ATLAS_SETUP_CORE_NATIVE_EXIT $operation $($p.ExitCode)" }
        } finally { $p.Dispose() }
        if (!(Test-Path -LiteralPath $target -PathType Leaf)) {
            throw "ATLAS_SETUP_CORE_RECEIPT_MISSING $operation"
        }
        return (Get-Content -LiteralPath $target -Raw | ConvertFrom-Json)
    }
    $native = Inspect '--inspect-file' (Join-Path $temporary 'inspect.json')
    if ($native.status -ne 'VERIFIED' -or $native.packageFormat -ne 'PE_RESOURCE_V2' -or
        $native.sourceCommit -ne $head -or $native.product -ne $product.id -or
        $native.entrypoint -ne $product.entrypoint -or $native.version -ne $product.version -or
        $native.packageSha256 -ne $receipt.payload_sha256) {
        throw 'ATLAS_SETUP_CORE_NATIVE_INSPECTION_INVALID'
    }
    $stage = Inspect '--stage-test-file' (Join-Path $temporary 'stage.json')
    if ($stage.status -ne 'STAGED_VERIFIED' -or $stage.product -ne $product.id) {
        throw 'ATLAS_SETUP_CORE_NATIVE_STAGE_INVALID'
    }
    $sha = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($outputPath + '.sha256',
        "$sha *$([IO.Path]::GetFileName($outputPath))" + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false))
    Write-Host "ATLAS05_SETUP_CORE_PACKAGE_PASS product=$($product.id) version=$($product.version) source=$head SHA256=$sha"
    if ($InstallForQualification) {
        $preflight = Inspect '--preflight-file' (Join-Path $temporary 'preflight.json')
        if ($preflight.status -ne 'READY_FOR_FIRST_INSTALL') {
            throw "ATLAS_SETUP_CLEAN_WINDOWS_REQUIRED status=$($preflight.status)"
        }
        $installed = Inspect '--install-file' (Join-Path $temporary 'installed.json')
        if ($installed.status -ne 'INSTALLED_NOT_LAUNCHED' -or $installed.product -ne $product.id) {
            throw 'ATLAS_SETUP_CORE_INSTALL_REJECTED'
        }
        $verified = Inspect '--verify-installed-file' (Join-Path $temporary 'verify.json')
        if ($verified.status -ne 'OWNED_FILES_VERIFIED' -or $verified.product -ne $product.id) {
            throw 'ATLAS_SETUP_CORE_OWNED_FILES_NOT_VERIFIED'
        }
        $locations = Inspect '--locations-file' (Join-Path $temporary 'locations.json')
        $expectedData = Join-Path $env:LOCALAPPDATA 'ru.iwxa.atlas'
        if ($locations.status -ne 'LOCATIONS_VERIFIED' -or
            [IO.Path]::GetFullPath([string]$locations.dataRoot).TrimEnd('\') -ine
            [IO.Path]::GetFullPath($expectedData).TrimEnd('\')) {
            throw 'ATLAS_SETUP_CORE_DATA_ROOT_MISMATCH'
        }
        $installedExe = Join-Path $locations.programRoot $product.entrypoint
        if (!(Test-Path -LiteralPath $installedExe -PathType Leaf)) {
            throw 'ATLAS_SETUP_CORE_INSTALLED_EXE_MISSING'
        }
        Add-Type -AssemblyName System.Drawing
        $nativeIcon = [Drawing.Icon]::ExtractAssociatedIcon($installedExe)
        if ($null -eq $nativeIcon) { throw 'ATLAS_SETUP_CORE_INSTALLED_ICON_MISSING' }
        try {
            $bmp = $nativeIcon.ToBitmap()
            try {
                $pixel = $bmp.GetPixel([int]($bmp.Width * 0.36),[int]($bmp.Height * 0.50))
                if (([Math]::Abs($pixel.R-63) -gt 25) -or
                    ([Math]::Abs($pixel.G-150) -gt 25) -or
                    ([Math]::Abs($pixel.B-237) -gt 25)) {
                    throw "ATLAS_SETUP_CORE_ICON_MISMATCH $($pixel.R),$($pixel.G),$($pixel.B)"
                }
            } finally { $bmp.Dispose() }
        } finally { $nativeIcon.Dispose() }
        "ATLAS_INSTALLED_EXE=$installedExe" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
        "ATLAS_SETUP_CORE_PACKAGE=$outputPath" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
        Write-Host "ATLAS05_SETUP_CORE_NATIVE_INSTALL_PASS data=$($locations.dataRoot) program=$($locations.programRoot)"
    }
} finally {
    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}
