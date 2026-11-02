# The installed Tauri GUI is driven through ordinary Windows keyboard input.
# No Chrome, CDP, WebView2 debugger, accessibility tree, or UIA dependencies.
# This runs only on an ephemeral GitHub-hosted Windows machine.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AtlasWindowsInput {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", EntryPoint="PostMessageW", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
}
'@

$exe = $env:ATLAS_INSTALLED_EXE
if (!$exe -or !(Test-Path -LiteralPath $exe)) { throw 'Installed Atlas executable not found' }
$store = Join-Path $env:LOCALAPPDATA 'ru.iwxa.atlas\atlas-store-v1'
$manifestPath = Join-Path $store 'head.json'
if (Test-Path -LiteralPath $manifestPath) {
    throw 'Windows qualification runner is not a fresh profile; will not overwrite existing Atlas data'
}
$names = @('AtlasGUIFirstSave', 'AtlasGUIAfterRestart')
$env:ATLAS_CI_RENDERER_PROBE = '1'

function Get-AtlasSnapshot {
    if (!(Test-Path -LiteralPath $manifestPath)) { return $null }
    $head = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -Depth 100
    $result = @()
    foreach ($entry in @($head.projects)) {
        if ($entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid project block reference' }
        $blockPath = Join-Path (Join-Path $store 'blocks') ($entry.sha256 + '.json')
        if (!(Test-Path -LiteralPath $blockPath)) { throw 'Missing native project block' }
        $project = Get-Content -LiteralPath $blockPath -Raw | ConvertFrom-Json -Depth 100
        if ($project.id -ne $entry.id) { throw 'Native block ID and manifest reference disagree' }
        $result += [pscustomobject]@{ id = [string]$project.id; name = [string]$project.name }
    }
    return [pscustomobject]@{
        generation = [string]$head.generation
        revision = [long]$head.revision
        projects = @($result)
    }
}
function Wait-AtlasState([int]$count, [string[]]$required) {
    for ($i = 0; $i -lt 80; $i++) {
        Start-Sleep -Milliseconds 350
        $state = Get-AtlasSnapshot
        if ($null -eq $state) { continue }
        $storedNames = @($state.projects | ForEach-Object { $_.name })
        $present = $true
        foreach ($name in $required) { if ($storedNames -notcontains $name) { $present = $false } }
        if ($state.projects.Count -eq $count -and $present) { return $state }
    }
    throw "Installed GUI did not commit the expected $count projects via Ctrl+S"
}
function Wait-AtlasOpen([System.Diagnostics.Process]$process) {
    $receipt = Join-Path $env:TEMP ("iwxa-atlas-renderer-" + $process.Id + ".probe")
    if (Test-Path -LiteralPath $receipt) { Remove-Item -LiteralPath $receipt -Force }
    for ($i=0; $i -lt 120; $i++) {
        Start-Sleep -Milliseconds 500
        $process.Refresh()
        if ($process.HasExited) { throw "Installed Atlas terminated before native open: $($process.ExitCode)" }
        if (Test-Path -LiteralPath $receipt) {
            $message = (Get-Content -LiteralPath $receipt -Raw).Trim()
            if ($message -ne 'ATLAS_TAURI_JS_NATIVE_OPEN_PASS') { throw "Native open failed: $message" }
            Write-Output "ATLAS_INSTALLED_GUI_NATIVE_OPEN_PASS pid=$($process.Id)"
            return
        }
    }
    $process.Refresh()
    throw "Installed WebView2 did not call atlas_open in GUI scenario (pid=$($process.Id), hasExited=$($process.HasExited), window=$($process.MainWindowHandle)). GUI acceptance HOLD."
}
function Activate-Atlas([System.Diagnostics.Process]$process) {
    for ($i = 0; $i -lt 20; $i++) {
        $process.Refresh()
        if ($process.HasExited) { throw 'Atlas closed before keyboard input' }
        if ($process.MainWindowHandle -ne [IntPtr]::Zero) { break }
        Start-Sleep -Milliseconds 300
    }
    $handle = $process.MainWindowHandle
    if ($handle -eq [IntPtr]::Zero) { throw 'Installed Atlas window not visible' }
    [void][AtlasWindowsInput]::ShowWindowAsync($handle,9)
    [void][AtlasWindowsInput]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 600
    if ([AtlasWindowsInput]::GetForegroundWindow() -ne $handle) {
        throw 'Hosted Windows session does not allow foreground keyboard input; GUI acceptance remains HOLD'
    }
}
function Send-AtlasProject([string]$name) {
    # Ctrl+N opens the actual React project form. The name input is autofocus.
    [System.Windows.Forms.SendKeys]::SendWait('^n')
    Start-Sleep -Milliseconds 750
    [System.Windows.Forms.SendKeys]::SendWait($name)
    Start-Sleep -Milliseconds 200
    # Ctrl+Enter applies the real form to the React domain draft.
    [System.Windows.Forms.SendKeys]::SendWait('^{ENTER}')
    Start-Sleep -Milliseconds 750
    # Ctrl+S uses Tauri atlas_commit, followed by native readback.
    [System.Windows.Forms.SendKeys]::SendWait('^s')
}
$original = $null
$forcedCloseAttempts = @()
try {
    for ($attempt=1; $attempt -le 2; $attempt++) {
        $process = Start-Process -FilePath $exe -PassThru
        try {
            Wait-AtlasOpen $process
            Activate-Atlas $process
            if ($attempt -eq 2) {
                $loaded = Get-AtlasSnapshot
                if ($null -eq $loaded -or $loaded.projects.Count -ne 1 -or
                    @($loaded.projects | ForEach-Object { $_.name }) -notcontains $names[0] -or
                    $loaded.generation -ne $original.generation) {
                    throw 'Native portfolio was not recovered after the full process restart'
                }
                Write-Output 'ATLAS_INSTALLED_GUI_REOPEN_PRIOR_PROJECT_PASS'
            }
            Send-AtlasProject $names[$attempt-1]
            $saved = Wait-AtlasState $attempt $names[0..($attempt-1)]
            if ($attempt -eq 1) { $original = $saved }
            else {
                if ($saved.generation -eq $original.generation) { throw 'Second GUI commit did not advance generation' }
                if (@($saved.projects | ForEach-Object { $_.id }) -notcontains $original.projects[0].id) {
                    throw 'Existing project ID was not preserved through the GUI relaunch'
                }
            }
            Write-Output "ATLAS_INSTALLED_GUI_COMMIT_READBACK_PASS attempt=$attempt projects=$($saved.projects.Count)"
            # The disk manifest appears as soon as Rust publishes the write.
            # Allow React's asynchronous atlas_open readback to finish before
            # requesting close; otherwise busyRef blocks the window event.
            Start-Sleep -Milliseconds 1500
            Activate-Atlas $process
            [System.Windows.Forms.SendKeys]::SendWait('%{F4}')
            $closeMode = 'Alt+F4'
            if (!$process.WaitForExit(4500)) {
                # GitHub-hosted Windows may deliver form keystrokes yet drop
                # Alt+F4. Post WM_CLOSE to the exact installed app HWND;
                # Tauri still runs its ordinary onCloseRequested handler.
                $process.Refresh()
                $handle = $process.MainWindowHandle
                if ($handle -eq [IntPtr]::Zero -or
                    ![AtlasWindowsInput]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)) {
                    throw 'Installed Atlas did not receive a native window close request'
                }
                $closeMode = 'WM_CLOSE'
                if (!$process.WaitForExit(7500)) {
                    # Failure to close cleanly is still HOLD, but test the
                    # persisted portfolio after process termination as a
                    # separate, objectively useful crash/restart scenario.
                    Write-Output "ATLAS_INSTALLED_GUI_GRACEFUL_CLOSE_HOLD attempt=$attempt"
                    $forcedCloseAttempts += $attempt
                    $closeMode = 'forced-for-persistence-test'
                    Stop-Process -Id $process.Id -Force -ErrorAction Stop
                    [void]$process.WaitForExit(10000)
                }
            }
            if ($closeMode -ne 'forced-for-persistence-test') {
                Write-Output "ATLAS_INSTALLED_GUI_GRACEFUL_CLOSE_PASS attempt=$attempt mode=$closeMode"
            }
        } finally {
            $process.Refresh()
            if (!$process.HasExited) {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
                [void]$process.WaitForExit(10000)
            }
            $receipt = Join-Path $env:TEMP ("iwxa-atlas-renderer-" + $process.Id + ".probe")
            Remove-Item -LiteralPath $receipt -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Output 'ATLAS_INSTALLED_GUI_FULL_PERSISTENCE_RELAUNCH_PASS'
    if ($forcedCloseAttempts.Count -gt 0) {
        throw "Persisted across forced restart but GUI normal close failed: $($forcedCloseAttempts -join ', '). Release acceptance remains HOLD."
    }
    Write-Output 'ATLAS_INSTALLED_GUI_GRACEFUL_LIFECYCLE_PASS'
} finally {
    Remove-Item Env:ATLAS_CI_RENDERER_PROBE -ErrorAction SilentlyContinue
}
