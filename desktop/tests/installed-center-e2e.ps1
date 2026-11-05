# Real two-installed-desktop interaction: Atlas GUI created the two JSON exports.
# This script installs existing Center, imports both via native Windows file
# chooser, persists a bounded WorkRef, observes stale revision, and restores
# the explicitly refreshed draft. No Chrome/CDP, mock Center, T3 or new Store.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AtlasCenterNativeWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder b, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@
$originalPath = $env:ATLAS_GUI_CENTER_EXPORT
$updatedPath = $env:ATLAS_GUI_CENTER_EXPORT_UPDATED
if (!(Test-Path -LiteralPath $originalPath) -or !(Test-Path -LiteralPath $updatedPath)) {
  throw 'Installed Atlas GUI JSON exports are required for the Center E2E'
}
$original = Get-Content -LiteralPath $originalPath -Raw | ConvertFrom-Json -Depth 100
$updated = Get-Content -LiteralPath $updatedPath -Raw | ConvertFrom-Json -Depth 100
$first = @($original.projects | Where-Object { $_.name -eq 'AtlasGUIFirstSave' })
if ($first.Count -ne 1) { throw 'Original installed Atlas GUI project missing' }
$next = @($updated.projects | Where-Object { $_.id -eq $first[0].id })
if ($next.Count -ne 1 -or $updated.revision -le $original.revision) {
  throw 'Atlas exported revisions or canonical project identity are invalid'
}
$work = @($first[0].items | Where-Object { $_.title -eq 'AtlasWorkBeta' })
if ($work.Count -ne 1) { throw 'Atlas WorkRef target is missing' }
$localDraft = Join-Path $env:LOCALAPPDATA 'ru.iwxa.admin-center\atlas-store-v1\preparation\draft.json'
$exe = Join-Path $env:LOCALAPPDATA 'IWXA Admin Center\iwxa-admin-center.exe'
$process = $null
function Screenshot([string]$name) {
  try {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = [System.Drawing.Bitmap]::new($b.Width,$b.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $graphics.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)
      $folder = Join-Path $env:GITHUB_WORKSPACE 'desktop/tests/visual-evidence'
      [void][System.IO.Directory]::CreateDirectory($folder)
      $bmp.Save((Join-Path $folder ("center-"+$name+".png")),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose();$bmp.Dispose() }
  } catch { Write-Warning "Center screenshot failed: $($_.Exception.Message)" }
}
function Start-Center {
  $script:process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
  for ($i=0;$i -lt 90;$i++) {
    Start-Sleep -Milliseconds 350
    $process.Refresh()
    if ($process.HasExited) { throw 'Installed Center terminated before opening its window' }
    if ($process.MainWindowHandle -ne [IntPtr]::Zero) { break }
  }
  if ($process.MainWindowHandle -eq [IntPtr]::Zero) { throw 'Installed Center native window not available' }
  Write-Output "ATLAS_CENTER_TWO_INSTALLED_CENTER_OPEN_PASS pid=$($process.Id)"
}
function Center-Root {
  $process.Refresh()
  if ($process.HasExited -or $process.MainWindowHandle -eq [IntPtr]::Zero) {
    throw 'Installed Center native window disappeared'
  }
  return [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
}
function Find-UIA([string]$name,[string]$kind='Button',[bool]$contains=$false) {
  $controlType = switch ($kind) {
    'Edit' {[System.Windows.Automation.ControlType]::Edit}
    default {[System.Windows.Automation.ControlType]::Button}
  }
  for ($i=0;$i -lt 65;$i++) {
    $root=Center-Root
    $condition=[System.Windows.Automation.Condition]::TrueCondition
    $nodes=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
    foreach ($element in $nodes) {
      try {
        $label=[string]$element.Current.Name
        if ($element.Current.ControlType -eq $controlType -and
            (($contains -and $label.Contains($name)) -or (!$contains -and $label -eq $name))) {
          return $element
        }
      } catch {}
    }
    Start-Sleep -Milliseconds 350
  }
  Screenshot ('missing-'+$kind)
  throw "Installed Center $kind not found: $name"
}
function Click-UIA([string]$name,[bool]$contains=$false) {
  $control=Find-UIA $name 'Button' $contains
  try {
    $pattern=$control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $pattern.Invoke()
  } catch {
    $control.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }
  Start-Sleep -Milliseconds 350
}
function Type-UIA([string]$name,[string]$value) {
  $control=Find-UIA $name 'Edit'
  $control.SetFocus()
  Start-Sleep -Milliseconds 150
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  if ($value -match '[+^%~{}()]') { throw 'Unsafe SendKeys fixture text' }
  [System.Windows.Forms.SendKeys]::SendWait($value)
  Start-Sleep -Milliseconds 200
}
function Wait-Text([string]$value) {
  for ($i=0;$i -lt 65;$i++) {
    $nodes=(Center-Root).FindAll([System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($element in $nodes) {
      try {
        if ($element.Current.Name.Contains($value)) { return }
      } catch {}
    }
    Start-Sleep -Milliseconds 350
  }
  Screenshot 'missing-text'
  throw "Installed Center did not render expected text: $value"
}
function Wait-AtlasRevisionMetric([string]$expected) {
  # In Center, "Редакция" and the integer are separate UIA Text nodes.
  for($i=0;$i -lt 65;$i++) {
    $all=(Center-Root).FindAll([System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    $values=[System.Collections.Generic.List[string]]::new()
    foreach($element in $all) {
      try {
        if($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text) {
          $value=[string]$element.Current.Name
          if (![string]::IsNullOrWhiteSpace($value)) { $values.Add($value.Trim()) }
        }
      } catch {}
    }
    for($index=0;$index -lt $values.Count;$index++) {
      if($values[$index] -ne 'Редакция') { continue }
      for($offset=1;$offset -le 5 -and ($index+$offset) -lt $values.Count;$offset++) {
        if($values[$index+$offset] -eq $expected) {
          Write-Output "ATLAS_CENTER_TWO_INSTALLED_GUI_REVISION_METRIC_PASS revision=$expected"
          return
        }
      }
    }
    Start-Sleep -Milliseconds 350
  }
  $preview=@($values | Where-Object {$_ -match 'Редакц|Atlas|^[0-9]+$'}) | Select-Object -First 28
  Write-Output "ATLAS_CENTER_REVISION_UIA_DIAGNOSTIC sample=$($preview -join ' | ')"
  Screenshot 'revision-metric-missing'
  throw "Center imported JSON but revision metric $expected was not exposed by UIA"
}
function Import-AtlasFile([string]$path,[string]$expectedRevision) {
  if (!(Test-Path -LiteralPath $path) -or $path -match '[+^%~{}()]') {
    throw "Invalid installed Atlas export path: $path"
  }
  $handle=$process.MainWindowHandle
  Click-UIA 'Открыть портфель Atlas'
  $dialog=''
  for ($i=0;$i -lt 80;$i++) {
    $foreground=[AtlasCenterNativeWin]::GetForegroundWindow()
    if ($foreground -ne [IntPtr]::Zero -and $foreground -ne $handle) {
      $buffer=[System.Text.StringBuilder]::new(512)
      [void][AtlasCenterNativeWin]::GetWindowText($foreground,$buffer,$buffer.Capacity)
      $dialog=$buffer.ToString()
      if ($dialog -match '(Open|Открыть|Choose|Выбор)') { break }
    }
    Start-Sleep -Milliseconds 250
  }
  if ($dialog -notmatch '(Open|Открыть|Choose|Выбор)') {
    Screenshot 'file-open-missing'
    throw "Center GUI import did not open a native file chooser: $dialog"
  }
  [System.Windows.Forms.SendKeys]::SendWait('%n')
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait($path)
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  $exported=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -Depth 100
  $expectedCount=@($exported.projects).Count
  Wait-Text ("Портфель Atlas прочитан: $expectedCount проектов")
  Wait-AtlasRevisionMetric $expectedRevision
  Wait-Text 'AtlasGUIFirstSave'
  Screenshot ('imported-'+$expectedRevision)
  Write-Output "ATLAS_CENTER_TWO_INSTALLED_GUI_FILE_IMPORT_PASS revision=$expectedRevision"
}
function Read-ManagerDraft {
  for ($i=0;$i -lt 80;$i++) {
    if (Test-Path -LiteralPath $localDraft) {
      try { return (Get-Content -LiteralPath $localDraft -Raw | ConvertFrom-Json -Depth 100) }
      catch {}
    }
    Start-Sleep -Milliseconds 350
  }
  throw 'Installed Center native manager draft readback unavailable'
}
function Assert-WorkBinding($expectedRevision) {
  # The native write is async. Await the exact saved WorkRef revision instead
  # of accepting the previous file still visible immediately after a click.
  $state=$null
  for($i=0;$i -lt 80;$i++) {
    $candidate=Read-ManagerDraft
    if(@($candidate.organizations).Count -eq 1 -and
        @($candidate.organizations[0].assignments).Count -eq 1 -and
        [string]$candidate.organizations[0].assignments[0].atlasRef.revision -eq [string]$expectedRevision) {
      $state=$candidate
      break
    }
    Start-Sleep -Milliseconds 200
  }
  if($null -eq $state){throw "Center draft readback never reached WorkRef revision $expectedRevision"}
  if (@($state.organizations).Count -ne 1) { throw 'Center did not persist one organization' }
  $org=$state.organizations[0]
  if (@($org.workspaces).Count -ne 1 -or @($org.assignments).Count -ne 1) {
    throw 'Center persisted neither workspace nor assignment'
  }
  $projectRef=$org.workspaces[0].atlasRef
  $workRef=$org.assignments[0].atlasRef
  if ($projectRef.projectId -ne $first[0].id -or $workRef.projectId -ne $first[0].id -or
      $workRef.workId -ne $work[0].id -or
      [string]$workRef.revision -ne [string]$expectedRevision) {
    throw 'Center draft lost the exact Atlas ProjectRef/WorkRef/revision'
  }
  if ($org.assignments[0].status -ne 'DRAFT') { throw 'Center assignment must remain DRAFT' }
  return $state
}
function Close-Center {
  $process.Refresh()
  if ($process.HasExited -or $process.MainWindowHandle -eq [IntPtr]::Zero) {
    throw 'Center process not open for graceful shutdown'
  }
  if (![AtlasCenterNativeWin]::PostMessage($process.MainWindowHandle,0x0010,
    [IntPtr]::Zero,[IntPtr]::Zero)) { throw 'Failed to post native Center WM_CLOSE' }
  if (!$process.WaitForExit(9000)) { throw 'Center GUI did not close cleanly' }
  Write-Output 'ATLAS_CENTER_TWO_INSTALLED_GUI_CLOSE_PASS'
}
try {
  $installer=Get-ChildItem -LiteralPath 'center-public/src-tauri/target/release/bundle/nsis' -Filter '*.exe' |
    Select-Object -First 1
  if (!$installer) { throw 'Existing Center NSIS installer missing after build' }
  $setup=Start-Process -FilePath $installer.FullName -ArgumentList '/S' -PassThru
  if (!$setup.WaitForExit(120000) -or $setup.ExitCode -ne 0) {
    throw 'Existing Center NSIS installer did not complete'
  }
  if (!(Test-Path -LiteralPath $exe)) { throw 'Installed Admin Center executable not found' }
  if (Test-Path -LiteralPath $localDraft) { throw 'Center manager draft not clean before E2E' }
  Write-Output 'ATLAS_CENTER_TWO_INSTALLED_NSIS_PASS'
  Start-Center
  Type-UIA 'Название' 'AtlasExternalCenterOrg'
  Click-UIA 'Создать черновик организации'
  Click-UIA 'Планы Atlas'
  Type-UIA 'Название рабочей области' 'AtlasExternalWorkspace'
  Click-UIA 'Добавить'
  Import-AtlasFile $originalPath ([string]$original.revision)
  Click-UIA 'Связать с планом'
  Click-UIA 'Подготовить поручение: AtlasWorkBeta' $true
  Type-UIA 'Что нужно сделать' 'AtlasExternalWorkAssignment'
  Type-UIA 'Критерии приёмки' 'VerifiedExternalResult'
  Click-UIA 'Сохранить черновик'
  Click-UIA 'Сохранить на компьютере'
  $saved=Assert-WorkBinding ([string]$original.revision)
  Write-Output 'ATLAS_CENTER_TWO_INSTALLED_GUI_PROJECT_WORK_DRAFT_PASS'
  Close-Center
  Start-Center
  Click-UIA 'Поручения' $true
  Click-UIA 'AtlasExternalWorkAssignment' $true
  Wait-Text 'Источник Atlas не открыт'
  Click-UIA 'Закрыть редактор'
  Click-UIA 'Планы Atlas'
  Import-AtlasFile $updatedPath ([string]$updated.revision)
  Wait-Text 'Редакция плана изменилась'
  $unchanged=Assert-WorkBinding ([string]$original.revision)
  Write-Output 'ATLAS_CENTER_TWO_INSTALLED_GUI_STALE_WORKREF_PASS'
  Click-UIA 'Поручения' $true
  Click-UIA 'AtlasExternalWorkAssignment' $true
  Wait-Text 'План Atlas изменился'
  Click-UIA 'Привязать к открытой редакции плана'
  Wait-Text ('редакция '+[string]$updated.revision)
  Click-UIA 'Сохранить черновик'
  Click-UIA 'Сохранить на компьютере'
  $refreshed=Assert-WorkBinding ([string]$updated.revision)
  if ($refreshed.organizations[0].assignments[0].id -ne
      $saved.organizations[0].assignments[0].id) {
    throw 'Explicit WorkRef refresh unexpectedly created a new assignment'
  }
  Write-Output 'ATLAS_CENTER_TWO_INSTALLED_GUI_EXPLICIT_REFRESH_PASS'
  Close-Center
  Start-Center
  Click-UIA 'Поручения' $true
  Click-UIA 'AtlasExternalWorkAssignment' $true
  $reopened=Assert-WorkBinding ([string]$updated.revision)
  Screenshot 'refreshed-after-restart'
  Write-Output 'ATLAS_CENTER_TWO_INSTALLED_GUI_RESTART_READBACK_PASS'
  Close-Center
} catch {
  Write-Output "ATLAS_CENTER_TWO_INSTALLED_GUI_FAIL $($_.Exception.Message)"
  Screenshot 'failed'
  throw
} finally {
  if ($null -ne $process) {
    $process.Refresh()
    if (!$process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  }
}
