# Product-specific verification over the real IWXA Setup Core CLI.
# All moves are initiated by Setup Core, never copied by this test.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$setup = [string]$env:ATLAS_SETUP_CORE_PACKAGE
if (!(Test-Path -LiteralPath $setup -PathType Leaf)) { throw 'ATLAS_SETUP_PACKAGE_MISSING' }
$original = Join-Path $env:LOCALAPPDATA 'ru.iwxa.atlas'
$oldHead = Join-Path $original 'atlas-store-v1/head.json'
if (!(Test-Path -LiteralPath $oldHead -PathType Leaf)) {
    throw 'ATLAS_SETUP_EXISTING_USER_DATA_MISSING'
}
$before = (Get-FileHash -LiteralPath $oldHead -Algorithm SHA256).Hash
$root = Join-Path $env:RUNNER_TEMP ('atlas05-setup-selected-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
function Invoke-Setup([string]$verb,[string]$result,[string]$inputFile='') {
    $arguments = if ($inputFile) {
        '{0} "{1}" "{2}"' -f $verb,$inputFile,$result
    } else {
        '{0} "{1}"' -f $verb,$result
    }
    $p=Start-Process -FilePath $setup -ArgumentList $arguments -PassThru
    try {
        if (!$p.WaitForExit(90000)) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            throw "ATLAS_SETUP_LIFECYCLE_TIMEOUT $verb"
        }
        if ($p.ExitCode -ne 0) { throw "ATLAS_SETUP_LIFECYCLE_EXIT $verb $($p.ExitCode)" }
    } finally { $p.Dispose() }
    if (!(Test-Path -LiteralPath $result -PathType Leaf)) {
        throw "ATLAS_SETUP_LIFECYCLE_RECEIPT_MISSING $verb"
    }
    return (Get-Content -LiteralPath $result -Raw | ConvertFrom-Json)
}
$prior=Invoke-Setup '--locations-file' (Join-Path $root 'before.json')
if ($prior.status -ne 'LOCATIONS_VERIFIED' -or
    [IO.Path]::GetFullPath([string]$prior.dataRoot).TrimEnd('\') -ine
    [IO.Path]::GetFullPath($original).TrimEnd('\')) {
    throw 'ATLAS_SETUP_WRONG_ORIGINAL_DATA_ROOT'
}
$newData=Join-Path $root 'selected-data'
$request=Join-Path $root 'locations-request.json'
$locations=[ordered]@{
    schema='IWXA_SETUP_LOCATIONS/1'
    programRoot=[string]$prior.programRoot
    dataRoot=$newData
    softwareRoot=[string]$prior.softwareRoot
    modelsRoot=[string]$prior.modelsRoot
    cacheRoot=[string]$prior.cacheRoot
    startWithWindows=$false
}
[IO.File]::WriteAllText($request,($locations|ConvertTo-Json -Depth 5),
    [Text.UTF8Encoding]::new($false))
$switched=Invoke-Setup '--migrate-locations-file' (Join-Path $root 'switched.json') $request
if ($switched.status -ne 'STORAGE_COPIED_AND_SWITCHED_ORIGINAL_PRESERVED' -or
    [IO.Path]::GetFullPath([string]$switched.dataRoot).TrimEnd('\') -ine
    [IO.Path]::GetFullPath($newData).TrimEnd('\')) {
    throw 'ATLAS_SETUP_STORAGE_RELOCATION_NOT_VERIFIED'
}
$newHead=Join-Path $newData 'atlas-store-v1/head.json'
if (!(Test-Path -LiteralPath $newHead -PathType Leaf) -or
    (Get-FileHash -LiteralPath $newHead -Algorithm SHA256).Hash -ne $before -or
    (Get-FileHash -LiteralPath $oldHead -Algorithm SHA256).Hash -ne $before) {
    throw 'ATLAS_SETUP_RELOCATION_CHANGED_EXISTING_PROJECT_DATA'
}
$readback=Invoke-Setup '--locations-file' (Join-Path $root 'after.json')
if ($readback.status -ne 'LOCATIONS_VERIFIED' -or
    [IO.Path]::GetFullPath([string]$readback.dataRoot).TrimEnd('\') -ine
    [IO.Path]::GetFullPath($newData).TrimEnd('\')) {
    throw 'ATLAS_SETUP_CUSTOM_DATA_LOCATION_NOT_REGISTERED'
}
$env:ATLAS_SETUP_MIGRATED_DATA_ROOT=$newData
python desktop/tests/installed-atlas05-github.py
if ($LASTEXITCODE -ne 0) { throw 'ATLAS_SETUP_SELECTED_DATA_GUI_RESTART_FAILED' }
if ((Get-FileHash -LiteralPath $oldHead -Algorithm SHA256).Hash -ne $before -or
    (Get-FileHash -LiteralPath $newHead -Algorithm SHA256).Hash -eq $before) {
    throw 'ATLAS_SETUP_SELECTED_DATA_NOT_ACTUALLY_USED'
}
$verified=Invoke-Setup '--verify-installed-file' (Join-Path $root 'verified.json')
if ($verified.status -ne 'OWNED_FILES_VERIFIED') {
    throw 'ATLAS_SETUP_PRODUCT_FILES_CHANGED_AFTER_RELOCATION'
}
$uninstalled=Invoke-Setup '--uninstall-file' (Join-Path $root 'uninstalled.json')
if ($uninstalled.status -ne 'UNINSTALLED_USER_DATA_PRESERVED' -or
    (Test-Path -LiteralPath $env:ATLAS_INSTALLED_EXE -PathType Leaf) -or
    !(Test-Path -LiteralPath $newHead -PathType Leaf) -or
    (Get-FileHash -LiteralPath $oldHead -Algorithm SHA256).Hash -ne $before) {
    throw 'ATLAS_SETUP_UNINSTALL_DID_NOT_PRESERVE_USER_DATA'
}
Write-Host 'ATLAS05_SETUP_CORE_CUSTOM_DATA_AND_UNINSTALL_PASS'
