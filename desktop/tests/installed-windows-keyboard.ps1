# The installed Tauri GUI is driven through ordinary Windows keyboard input.
# No Chrome, CDP, WebView2 debugger, accessibility tree, or UIA dependencies.
# This runs only on an ephemeral GitHub-hosted Windows machine.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AtlasWindowsInput {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int maxCount);
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
        $result += [pscustomobject]@{
            id = [string]$project.id
            name = [string]$project.name
            workTitles = @($project.items | ForEach-Object { [string]$_.title })
            dependencyCount = @($project.dependencies).Count
        }
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
    Capture-AtlasView 'installed-save-no-expected-projects'
    throw "Installed GUI did not save the expected $count projects through the visible Save button; see retained screenshot"
}
function Wait-AtlasOpen([System.Diagnostics.Process]$process) {
    $receipt = Join-Path $env:TEMP ("iwxa-atlas-renderer-" + $process.Id + ".probe")
    # NEVER delete a receipt after Start-Process: WebView2 may have called
    # atlas_open before this function starts. Deletion caused a false timeout.
    # A reused process ID from an older run must not qualify this one.
    $launchTimeUtc = $process.StartTime.ToUniversalTime()
    for ($i=0; $i -lt 120; $i++) {
        $process.Refresh()
        if ($process.HasExited) { throw "Installed Atlas terminated before native open: $($process.ExitCode)" }
        $file = Get-Item -LiteralPath $receipt -ErrorAction SilentlyContinue
        if ($null -ne $file -and $file.LastWriteTimeUtc -ge $launchTimeUtc.AddSeconds(-2)) {
            # A short read may race fs::write; retry rather than treating a
            # transient empty/locked file as a product failure.
            try { $message = (Get-Content -LiteralPath $receipt -Raw -ErrorAction Stop).Trim() }
            catch [System.IO.IOException] { $message = "" }
            if ($message -eq 'ATLAS_TAURI_JS_NATIVE_OPEN_PASS') {
                Write-Output "ATLAS_INSTALLED_GUI_NATIVE_OPEN_PASS pid=$($process.Id)"
                return
            }
            if ($message -eq 'ATLAS_TAURI_JS_NATIVE_OPEN_ERROR') {
                throw "Installed Atlas reached Rust but atlas_open failed: pid=$($process.Id)"
            }
        }
        Start-Sleep -Milliseconds 500
    }
    $process.Refresh()
    Write-Output "ATLAS_INSTALLED_STARTUP_DIAGNOSTIC_HOLD pid=$($process.Id) window=$($process.MainWindowHandle) title=$($process.MainWindowTitle)"
    # Preserve a real image of the hosted session when the WebView2 bridge
    # did not start. No UIA/CDP, synthetic success, or implicit retry.
    Capture-AtlasView 'installed-startup-no-native-open'
    throw "Installed WebView2 did not call atlas_open in GUI scenario (pid=$($process.Id), hasExited=$($process.HasExited), window=$($process.MainWindowHandle), title=$($process.MainWindowTitle)). GUI acceptance HOLD."
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
function Wait-AtlasTitle([System.Diagnostics.Process]$process,[string]$marker) {
    for ($i=0; $i -lt 48; $i++) {
        $process.Refresh()
        if ($process.HasExited) { throw 'Native window closed before visual tab qualified' }
        if ($process.MainWindowTitle.Contains($marker)) {
            Write-Output "ATLAS_INSTALLED_NATIVE_VIEW_TITLE_PASS marker=$marker"
            return
        }
        Start-Sleep -Milliseconds 250
    }
    Capture-AtlasView 'installed-title-mismatch'
    throw "Active installed view was not shown: $marker (window title=$($process.MainWindowTitle))"
}
function Click-AtlasAt([System.Diagnostics.Process]$process,[int]$cssX,[int]$cssY) {
    Activate-Atlas $process
    $handle=$process.MainWindowHandle
    $rect=[AtlasWindowsInput+Rect]::new()
    if (![AtlasWindowsInput]::GetWindowRect($handle,[ref]$rect)) {
        throw 'Cannot measure installed Atlas window for visible action'
    }
    $dpi=[AtlasWindowsInput]::GetDpiForWindow($handle)
    $scale=if ($dpi -gt 0) { [double]$dpi / 96.0 } else { 1.0 }
    $x=$rect.Left + [int][Math]::Round($cssX * $scale)
    $y=$rect.Top + [int][Math]::Round($cssY * $scale)
    if (![AtlasWindowsInput]::SetCursorPos($x,$y)) { throw 'Cannot move pointer to visible Atlas action' }
    Start-Sleep -Milliseconds 220
    [AtlasWindowsInput]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
    [AtlasWindowsInput]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
}
function Click-AtlasTab([System.Diagnostics.Process]$process,[string]$name) {
    # The screenshot-qualified tabstrip sits under the project heading.
    # Coordinates are within the real window at its minimum hosted 1024px width.
    $x=switch ($name) {
        'work' { 330 }
        'timeline' { 478 }
        'graph' { 570 }
        default { throw 'Unsupported view tab' }
    }
    Click-AtlasAt $process $x 338
}
function Click-AtlasWorkAction([System.Diagnostics.Process]$process,[string]$kind) {
    # Work action toolbar is right-aligned inside the first table surface.
    # Captured screenshot on failure provides evidence if the layout changes.
    $x=switch ($kind) {
        'work' { 747 }
        'dependency' { 905 }
        default { throw 'Unsupported work action' }
    }
    Click-AtlasAt $process $x 419
}
function Send-AtlasWork([string]$name, [System.Diagnostics.Process]$process) {
    Click-AtlasWorkAction $process 'work'
    Wait-AtlasTitle $process 'Форма: Новая работа'
    [System.Windows.Forms.SendKeys]::SendWait($name)
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait('^{ENTER}')
    Wait-AtlasTitle $process 'Таблица · Не сохранено'
}
function Wait-AtlasDAG([string]$projectName,[string]$beforeGeneration) {
    for ($i=0; $i -lt 90; $i++) {
        Start-Sleep -Milliseconds 350
        $state=Get-AtlasSnapshot
        if ($null -eq $state -or $state.generation -eq $beforeGeneration) { continue }
        $project=@($state.projects | Where-Object { $_.name -eq $projectName })
        if ($project.Count -eq 1 -and $project[0].workTitles.Count -eq 2 -and
            $project[0].workTitles -contains 'AtlasWorkAlpha' -and
            $project[0].workTitles -contains 'AtlasWorkBeta' -and
            $project[0].dependencyCount -eq 1) {
            Write-Output 'ATLAS_INSTALLED_GUI_WORK_DEPENDENCY_READBACK_PASS'
            return $state
        }
    }
    Capture-AtlasView 'installed-work-dependency-not-saved'
    throw 'Installed GUI did not save both works and a dependency'
}
function Capture-AtlasView([string]$name) {
    try {
        Add-Type -AssemblyName System.Drawing
        $bounds=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap=[System.Drawing.Bitmap]::new($bounds.Width,$bounds.Height)
        $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size)
            $dir=Join-Path $env:GITHUB_WORKSPACE 'desktop/tests/visual-evidence'
            [void][System.IO.Directory]::CreateDirectory($dir)
            $bitmap.Save((Join-Path $dir ($name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
            Write-Output "ATLAS_INSTALLED_GUI_SCREENSHOT_CAPTURED view=$name"
        } finally { $graphics.Dispose();$bitmap.Dispose() }
    } catch {
        Write-Warning "Installed screenshot unavailable: $($_.Exception.Message)"
    }
}
function Click-AtlasCreateProject([System.Diagnostics.Process]$process) {
    # The installed screenshot confirms a stable sidebar action at CSS x~105/y~214.
    # The WebView2 runtime or hosted SendKeys may consume Ctrl+N before React.
    # Qualify the real on-screen user action instead of relying on that shortcut.
    Activate-Atlas $process
    $handle = $process.MainWindowHandle
    $rect = [AtlasWindowsInput+Rect]::new()
    if (![AtlasWindowsInput]::GetWindowRect($handle,[ref]$rect)) {
        throw 'Installed Atlas window bounds are unavailable for visible project button'
    }
    $dpi = [AtlasWindowsInput]::GetDpiForWindow($handle)
    $scale = if ($dpi -gt 0) { [double]$dpi / 96.0 } else { 1.0 }
    $x = $rect.Left + [int][Math]::Round(104 * $scale)
    $y = $rect.Top + [int][Math]::Round(214 * $scale)
    if (![AtlasWindowsInput]::SetCursorPos($x,$y)) { throw 'Cannot move pointer to visible project creation action' }
    Start-Sleep -Milliseconds 200
    [AtlasWindowsInput]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
    [AtlasWindowsInput]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
}
function Click-AtlasSave([System.Diagnostics.Process]$process) {
    # Use the actual right-aligned Save button, not an accelerator intercepted
    # by WebView2 or lost by hosted keyboard delivery.
    Activate-Atlas $process
    $handle = $process.MainWindowHandle
    $rect = [AtlasWindowsInput+Rect]::new()
    if (![AtlasWindowsInput]::GetWindowRect($handle,[ref]$rect)) {
        throw 'Cannot locate native Atlas window for Save control'
    }
    $dpi = [AtlasWindowsInput]::GetDpiForWindow($handle)
    $scale = if ($dpi -gt 0) { [double]$dpi / 96.0 } else { 1.0 }
    # Installed 0.5 at 1024px: blue Save button is x=696..786. The prior
    # right-191 position clicked the adjacent file menu, leaving Save unsent.
    $x = $rect.Right - [int][Math]::Round(282 * $scale)
    $y = $rect.Top + [int][Math]::Round(61 * $scale)
    if (![AtlasWindowsInput]::SetCursorPos($x,$y)) { throw 'Cannot move pointer to Save control' }
    Start-Sleep -Milliseconds 200
    [AtlasWindowsInput]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)
    [AtlasWindowsInput]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)
}
function Export-AtlasSavedJsonForCenter([System.Diagnostics.Process]$process, $saved, [string]$projectName,
    [string]$outputName='atlas-center-gui-export.json', [string]$activeView='Таблица') {
    # Real Windows user action -> native Tauri Save As -> atomic JSON export.
    # No synthetic CLI export, competing Store, or automatic Center authority.
    if ($outputName -notin @('atlas-center-gui-export.json','atlas-center-gui-export-updated.json')) {
        throw 'Unexpected Atlas GUI export qualification file name'
    }
    $target = Join-Path $env:GITHUB_WORKSPACE $outputName
    if (Test-Path -LiteralPath $target) { throw 'Center export already exists in the qualification workspace' }
    if ($target -match '[+^%~{}()]') { throw 'Export path contains Windows SendKeys metacharacters' }
    Activate-Atlas $process
    $appHandle = $process.MainWindowHandle
    Capture-AtlasView 'installed-center-before-export'
    # Installed ProjectRef screenshot: button occupies x=269..437, y=546..582.
    Click-AtlasAt $process 350 563
    $dialogTitle = ''
    for ($i=0; $i -lt 80; $i++) {
        $foreground = [AtlasWindowsInput]::GetForegroundWindow()
        if ($foreground -ne [IntPtr]::Zero -and $foreground -ne $appHandle) {
            $titleText = [System.Text.StringBuilder]::new(512)
            [void][AtlasWindowsInput]::GetWindowText($foreground,$titleText,$titleText.Capacity)
            if ($titleText.ToString() -match '(Atlas JSON|Save As|Сохранить)') {
                $dialogTitle = $titleText.ToString()
                break
            }
        }
        Start-Sleep -Milliseconds 250
    }
    if (!$dialogTitle) {
        Capture-AtlasView 'installed-center-save-dialog-missing'
        throw 'ProjectRef JSON action did not open the expected native Save As dialog'
    }
    Write-Output "ATLAS_INSTALLED_CENTER_NATIVE_SAVE_DIALOG_PASS title=$dialogTitle"
    Capture-AtlasView 'installed-center-save-dialog'
    # The English common dialog uses Alt+N for "File name". Avoid an 8.3
    # path containing ~, which SendKeys would interpret as Enter.
    [System.Windows.Forms.SendKeys]::SendWait('%n')
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    [System.Windows.Forms.SendKeys]::SendWait($target)
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    $snapshot = $null
    for ($i=0; $i -lt 100; $i++) {
        Start-Sleep -Milliseconds 300
        if (Test-Path -LiteralPath $target) {
            $snapshot = Get-Content -LiteralPath $target -Raw -ErrorAction Stop | ConvertFrom-Json -Depth 100
            break
        }
    }
    if ($null -eq $snapshot) {
        Capture-AtlasView 'installed-center-export-missing'
        throw 'Installed Atlas did not write user-selected JSON via its native save dialog'
    }
    $matched = @($snapshot.projects | Where-Object { $_.name -eq $projectName })
    if ($snapshot.schema -ne 'atlas.project/1' -or
        [long]$snapshot.revision -ne $saved.revision -or
        @($snapshot.projects).Count -ne $saved.projects.Count -or $matched.Count -ne 1 -or
        [string]$matched[0].id -ne [string]$saved.projects[0].id -or
        @($matched[0].items).Count -ne 2 -or @($matched[0].dependencies).Count -ne 1 -or
        @($matched[0].items | Where-Object { $_.title -eq 'AtlasWorkAlpha' }).Count -ne 1 -or
        @($matched[0].items | Where-Object { $_.title -eq 'AtlasWorkBeta' }).Count -ne 1) {
        throw 'Exported GUI JSON differs from native saved project, revision, works or dependency'
    }
    $after = Get-AtlasSnapshot
    if ($null -eq $after -or $after.generation -ne $saved.generation) {
        throw 'Atlas native generation changed during read-only export'
    }
    $activeProject = [string]$saved.projects[$saved.projects.Count-1].name
    $expectedTitle = "IWXA Atlas — $activeProject — $activeView"
    $actualTitle = ''
    for ($i=0; $i -lt 50; $i++) {
        $process.Refresh()
        $actualTitle = $process.MainWindowTitle
        if ($actualTitle -eq $expectedTitle) { break }
        Start-Sleep -Milliseconds 250
    }
    if ($actualTitle -ne $expectedTitle) {
        Capture-AtlasView 'installed-center-export-modal-stuck'
        throw "JSON was written but Atlas GUI did not return to project: $actualTitle"
    }
    if ($outputName -eq 'atlas-center-gui-export.json') { $variable = 'ATLAS_GUI_CENTER_EXPORT' }
    else { $variable = 'ATLAS_GUI_CENTER_EXPORT_UPDATED' }
    "$variable=$target" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
    Write-Output "ATLAS_INSTALLED_GUI_CENTER_JSON_EXPORT_PASS revision=$($saved.revision) projects=$($saved.projects.Count) works=2 dependencies=1 generationUnchanged=true output=$outputName"
}

function Send-AtlasProject([string]$name, [System.Diagnostics.Process]$process) {
    # Verify React really opened its editor before entering project data.
    Click-AtlasCreateProject $process
    Wait-AtlasTitle $process 'Форма: Новый проект'
    [System.Windows.Forms.SendKeys]::SendWait($name)
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait('^{ENTER}')
    # The app must first apply the form and select the named draft.
    Wait-AtlasTitle $process ($name + ' — Обзор · Не сохранено')
    # Visible action -> Rust atlas_commit -> independent native readback.
    Click-AtlasSave $process
}
$original = $null
$forcedCloseAttempts = @()
try {
    for ($attempt=1; $attempt -le 2; $attempt++) {
        $process = Start-Process -FilePath $exe -PassThru
        try {
            Wait-AtlasOpen $process
            Activate-Atlas $process
            Wait-AtlasTitle $process 'Портфель — Обзор'
            if ($attempt -eq 2) {
                $loaded = Get-AtlasSnapshot
                if ($null -eq $loaded -or $loaded.projects.Count -ne 1 -or
                    @($loaded.projects | ForEach-Object { $_.name }) -notcontains $names[0] -or
                    $loaded.generation -ne $original.generation) {
                    throw 'Native portfolio was not recovered after the full process restart'
                }
                Write-Output 'ATLAS_INSTALLED_GUI_REOPEN_PRIOR_PROJECT_PASS'
            }
            Send-AtlasProject $names[$attempt-1] $process
            $saved = Wait-AtlasState $attempt $names[0..($attempt-1)]
            if ($attempt -eq 1) {
                Start-Sleep -Milliseconds 1400
                Activate-Atlas $process
                Click-AtlasTab $process 'work'
                Wait-AtlasTitle $process 'Таблица'
                Capture-AtlasView 'installed-work-table'
                Send-AtlasWork 'AtlasWorkAlpha' $process
                Send-AtlasWork 'AtlasWorkBeta' $process
                # The shared editor defaults to two different works: Alpha -> Beta.
                # Do not depend on browser-specific TAB/DOWN select behaviour.
                Click-AtlasWorkAction $process 'dependency'
                Wait-AtlasTitle $process 'Форма: Добавить зависимость'
                [System.Windows.Forms.SendKeys]::SendWait('^{ENTER}')
                Wait-AtlasTitle $process 'Таблица · Не сохранено'
                Click-AtlasSave $process
                $saved=Wait-AtlasDAG $names[0] $saved.generation
                Start-Sleep -Milliseconds 1350
                Activate-Atlas $process
                # Real installed WebView2: open ProjectRef from the saved native
                # generation, prove the dialog rendered through native HWND,
                # and ensure this read-only handoff did not advance the Store.
                # Hosted SendKeys has previously dropped Ctrl+N/Ctrl+S.
                # Screenshot from the 1024x768 hosted Windows desktop places
                # the button at x=693..822/y=267..301. The old y=248 hit
                # empty heading space, so it could never open ProjectRef.
                Capture-AtlasView 'installed-before-project-ref-click'
                Click-AtlasAt $process 758 284
                Wait-AtlasTitle $process 'Ссылка на проект'
                Capture-AtlasView 'installed-saved-project-reference'
                $afterReference = Get-AtlasSnapshot
                if ($null -eq $afterReference -or $afterReference.generation -ne $saved.generation) {
                    throw 'Opening a ProjectRef preview unexpectedly modified native Atlas state'
                }
                [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
                Wait-AtlasTitle $process 'Таблица'
                Write-Output 'ATLAS_INSTALLED_SAVED_PROJECT_REF_DIALOG_PASS'
                # Exercise the native Save As route from this same saved ProjectRef.
                Click-AtlasAt $process 758 284
                Wait-AtlasTitle $process 'Ссылка на проект'
                Export-AtlasSavedJsonForCenter $process $saved $names[0]
                Click-AtlasTab $process 'timeline'
                Wait-AtlasTitle $process 'График'
                Capture-AtlasView 'installed-gantt'
                Click-AtlasTab $process 'graph'
                Wait-AtlasTitle $process 'Зависимости'
                Capture-AtlasView 'installed-dag'
                $original = $saved
            }
            else {
                if ($saved.generation -eq $original.generation) { throw 'Second GUI commit did not advance generation' }
                $prior=@($saved.projects | Where-Object { $_.name -eq $names[0] })
                if ($prior.Count -ne 1 -or $prior[0].workTitles.Count -ne 2 -or
                    $prior[0].dependencyCount -ne 1) {
                    throw 'Saved work dependency graph was not retained across Windows GUI restart'
                }
                if (@($saved.projects | ForEach-Object { $_.id }) -notcontains $original.projects[0].id) {
                    throw 'Existing project ID was not preserved through the GUI relaunch'
                }
                # A real subsequent save advances the authoritative portfolio
                # revision while preserving the old WorkRef target. Export that
                # edition through the same installed GUI and native Save As.
                Start-Sleep -Milliseconds 1350
                Activate-Atlas $process
                Click-AtlasAt $process 758 284
                Wait-AtlasTitle $process 'Ссылка на проект'
                Export-AtlasSavedJsonForCenter $process $saved $names[0] 'atlas-center-gui-export-updated.json' 'Обзор'
                Write-Output 'ATLAS_INSTALLED_GUI_CENTER_UPDATED_EDITION_PASS'
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
