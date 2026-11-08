# Atlas 0.4 installed Windows: actual Tauri window, keyboard, mouse and native CAS.
# No browser debugger, CDP, UIA or synthetic app data are used.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Atlas04Win32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr handle, int x, int y, int width, int height, bool repaint);
    [DllImport("user32.dll", EntryPoint="PostMessageW", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PostMessage(IntPtr handle, uint message, IntPtr wParam, IntPtr lParam);
}
'@

$exe = $env:ATLAS_INSTALLED_EXE
if (!$exe -or !(Test-Path -LiteralPath $exe)) { throw 'Installed Atlas 0.4 EXE missing' }
$store = Join-Path $env:LOCALAPPDATA 'ru.iwxa.atlas\atlas-store-v1'
$manifest = Join-Path $store 'head.json'
if (Test-Path -LiteralPath $manifest) { throw 'GUI qualification must use an empty Windows profile' }
$env:ATLAS_CI_RENDERER_PROBE='1'
$fixtureName='Atlas04InstalledUX'
$script:process = $null

function Activate-Atlas([System.Diagnostics.Process]$p) {
    $p.Refresh()
    $handle=$p.MainWindowHandle
    if ($handle -eq [IntPtr]::Zero) { throw 'Installed Atlas has no native window' }
    [void][Atlas04Win32]::ShowWindowAsync($handle,9)
    [void][Atlas04Win32]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 280
}
function Wait-AtlasOpen([System.Diagnostics.Process]$p) {
    $receipt=Join-Path $env:TEMP ("iwxa-atlas-renderer-"+$p.Id+".probe")
    $since=$p.StartTime.ToUniversalTime()
    for($i=0;$i -lt 110;$i++) {
        $p.Refresh()
        if ($p.HasExited) { throw 'Installed Atlas exited before native open' }
        $item=Get-Item -LiteralPath $receipt -ErrorAction SilentlyContinue
        if ($null -ne $item -and $item.LastWriteTimeUtc -ge $since.AddSeconds(-2)) {
            $message=''
            try { $message=(Get-Content -LiteralPath $receipt -Raw -ErrorAction Stop).Trim() }
            catch [System.IO.IOException] {}
            if ($message -eq 'ATLAS_TAURI_JS_NATIVE_OPEN_PASS') {
                Write-Output "ATLAS04_NATIVE_OPEN_PASS pid=$($p.Id)"
                return
            }
            if ($message -eq 'ATLAS_TAURI_JS_NATIVE_OPEN_ERROR') { throw 'Native atlas_open failed' }
        }
        Start-Sleep -Milliseconds 350
    }
    throw 'Atlas native renderer did not open'
}
function Wait-AtlasTitle([System.Diagnostics.Process]$p,[string]$marker) {
    for($i=0;$i -lt 80;$i++) {
        $p.Refresh()
        if ($p.HasExited) { throw "Atlas exited while waiting for $marker" }
        if ($p.MainWindowTitle.Contains($marker)) {
            Write-Output "ATLAS04_WINDOW_TITLE_PASS marker=$marker"
            return
        }
        Start-Sleep -Milliseconds 200
    }
    Capture-Atlas "missing-title"
    throw "Expected installed view '$marker', got '$($p.MainWindowTitle)'"
}
function Capture-Atlas([string]$name) {
    $dir=Join-Path $PSScriptRoot 'visual-evidence'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    try {
        $bounds=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp=[System.Drawing.Bitmap]::new($bounds.Width,$bounds.Height)
        $g=[System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.CopyFromScreen($bounds.X,$bounds.Y,0,0,$bounds.Size)
            $output=Join-Path $dir ("atlas04-"+$name+".png")
            $bmp.Save($output,[System.Drawing.Imaging.ImageFormat]::Png)
            Write-Output "ATLAS04_SCREENSHOT_CAPTURED view=$name"
        } finally { $g.Dispose();$bmp.Dispose() }
    } catch { Write-Warning "Screenshot failed: $($_.Exception.Message)" }
}
function Click-Atlas([System.Diagnostics.Process]$p,[int]$x,[int]$y) {
    Activate-Atlas $p
    $rect=[Atlas04Win32+Rect]::new()
    if(![Atlas04Win32]::GetWindowRect($p.MainWindowHandle,[ref]$rect)) { throw 'No native window bounds' }
    $dpi=[Atlas04Win32]::GetDpiForWindow($p.MainWindowHandle)
    $scale=if($dpi -gt 0) {[double]$dpi/96.0} else {1.0}
    $dx=$rect.Left + [int][Math]::Round($x*$scale)
    $dy=$rect.Top + [int][Math]::Round($y*$scale)
    if(![Atlas04Win32]::SetCursorPos($dx,$dy)) { throw 'Cannot click installed Atlas' }
    Start-Sleep -Milliseconds 190
    [Atlas04Win32]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
    [Atlas04Win32]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
}
function Read-NativePortfolio {
    if (!(Test-Path -LiteralPath $manifest)) { return $null }
    $head=Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json -Depth 100
    $projects=@()
    foreach($block in @($head.projects)) {
        if ([string]$block.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Corrupt Atlas native block hash' }
        $path=Join-Path (Join-Path $store 'blocks') ([string]$block.sha256+'.json')
        $content=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -Depth 100
        if ([string]$content.id -ne [string]$block.id) { throw 'Native project ID mismatch' }
        $projects+=([string]$content.name)
    }
    return [pscustomobject]@{generation=[string]$head.generation;revision=[long]$head.revision;names=@($projects)}
}
function Wait-ProjectSaved {
    for($i=0;$i -lt 60;$i++) {
        $snapshot=Read-NativePortfolio
        if($null -ne $snapshot -and $snapshot.names.Count -eq 1 -and $snapshot.names[0] -eq $fixtureName) { return $snapshot }
        Start-Sleep -Milliseconds 220
    }
    Capture-Atlas 'save-failed'
    throw 'Installed 0.4 GUI did not persist the new project'
}
function Close-Atlas([System.Diagnostics.Process]$p) {
    Activate-Atlas $p
    [System.Windows.Forms.SendKeys]::SendWait('%{F4}')
    if(!$p.WaitForExit(4500)) {
        if(![Atlas04Win32]::PostMessage($p.MainWindowHandle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)) {
            throw 'WM_CLOSE request rejected'
        }
        if(!$p.WaitForExit(8500)) { throw 'Installed Atlas did not close cleanly' }
    }
    Write-Output 'ATLAS04_NATIVE_CLOSE_PASS'
}

try {
    $script:process=Start-Process -FilePath $exe -PassThru
    Wait-AtlasOpen $script:process
    Activate-Atlas $script:process
    $window=$script:process.MainWindowHandle
    [void][Atlas04Win32]::MoveWindow($window,0,0,1024,710,$true)
    Start-Sleep -Milliseconds 550
    Wait-AtlasTitle $script:process 'Портфель — Обзор'
    Capture-Atlas 'portfolio-1024'

    Click-Atlas $script:process 105 214
    Wait-AtlasTitle $script:process 'Форма: Новый проект'
    [System.Windows.Forms.SendKeys]::SendWait($fixtureName)
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait('^{ENTER}')
    Wait-AtlasTitle $script:process ($fixtureName+' — Обзор · Не сохранено')
    Capture-Atlas 'project-overview-1024'
    Activate-Atlas $script:process
    [System.Windows.Forms.SendKeys]::SendWait('^s')
    $snapshot=$null
    for($i=0;$i -lt 22;$i++) {
        $snapshot=Read-NativePortfolio
        if($null -ne $snapshot) { break }
        Start-Sleep -Milliseconds 220
    }
    if($null -eq $snapshot) {
        Click-Atlas $script:process 803 75
        Write-Output 'ATLAS04_KEYBOARD_SAVE_HOLD_FALLBACK_GUI_CLICK'
    }
    $snapshot=Wait-ProjectSaved
    Write-Output "ATLAS04_GUI_NATIVE_SAVE_PASS generation=$($snapshot.generation) revision=$($snapshot.revision)"
    Capture-Atlas 'project-saved-1024'

    foreach($test in @(@{key='^1';title='Таблица';image='table'},
                       @{key='^2';title='График';image='gantt'},
                       @{key='^3';title='Зависимости';image='dag'})) {
        Activate-Atlas $script:process
        [System.Windows.Forms.SendKeys]::SendWait([string]$test.key)
        Wait-AtlasTitle $script:process ([string]$test.title)
        Capture-Atlas ([string]$test.image)
    }
    Write-Output 'ATLAS04_INSTALLED_SHORTCUT_VIEWS_PASS'
    Close-Atlas $script:process
    $script:process=$null

    $script:process=Start-Process -FilePath $exe -PassThru
    Wait-AtlasOpen $script:process
    Wait-AtlasTitle $script:process 'Портфель — Обзор'
    $restored=Read-NativePortfolio
    if($null -eq $restored -or $restored.generation -ne $snapshot.generation -or
       $restored.revision -ne $snapshot.revision -or
       $restored.names.Count -ne 1 -or $restored.names[0] -ne $fixtureName) {
        throw 'Native CAS data changed after full installed process restart'
    }
    Write-Output 'ATLAS04_INSTALLED_RESTART_READBACK_PASS'
    Capture-Atlas 'restarted-1024'
    Close-Atlas $script:process
    $script:process=$null
    Write-Output 'ATLAS04_INSTALLED_GUI_SMOKE_PASS'
} finally {
    if($null -ne $script:process) {
        $script:process.Refresh()
        if(!$script:process.HasExited) {
            Stop-Process -Id $script:process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item Env:ATLAS_CI_RENDERER_PROBE -ErrorAction SilentlyContinue
}
