param(
  [string]$TargetInstallDir = (Split-Path -Parent $PSScriptRoot),
  [string]$ShortcutPath = ""
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $TargetInstallDir 'start-virtual-office.bat'))) {
  if (Test-Path (Join-Path $PSScriptRoot 'start-virtual-office.bat')) {
    $TargetInstallDir = $PSScriptRoot
  }
}

$LauncherBat = Join-Path $TargetInstallDir 'start-virtual-office.bat'
if (-not $ShortcutPath) {
  $DesktopDir = [Environment]::GetFolderPath('Desktop')
  $ShortcutPath = Join-Path $DesktopDir 'The Virtual Office for Your Work.lnk'
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $LauncherBat
$Shortcut.WorkingDirectory = $TargetInstallDir
$Shortcut.Description = 'Launch The Virtual Office for Your Work (Local AI Coding Workspace & Pixel Office)'
$IcoCandidates = @(
  (Join-Path $TargetInstallDir 'app.ico'),
  (Join-Path $TargetInstallDir 'dist\client\assets\app.ico'),
  (Join-Path $PSScriptRoot 'app.ico'),
  (Join-Path (Split-Path -Parent $PSScriptRoot) 'app.ico')
)
$FoundIco = $null
foreach ($c in $IcoCandidates) {
  if (Test-Path $c) {
    $FoundIco = $c
    break
  }
}

if ($FoundIco) {
  $Shortcut.IconLocation = "$FoundIco,0"
} else {
  $Shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,15"
}
$Shortcut.Save()

Write-Host "[Shortcut] Created Windows shortcut at: $ShortcutPath" -ForegroundColor Green
