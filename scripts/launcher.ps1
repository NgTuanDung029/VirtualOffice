param(
  [switch]$NoBrowser = $false
)

$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $AppRoot 'dist\server\index.mjs'))) {
  if (Test-Path (Join-Path $PSScriptRoot 'dist\server\index.mjs')) {
    $AppRoot = $PSScriptRoot
  }
}

$DataDir = if ($env:VIRTUAL_OFFICE_DATA_DIR) {
  $env:VIRTUAL_OFFICE_DATA_DIR
} else {
  Join-Path $env:LOCALAPPDATA 'VirtualOffice'
}
$RuntimeFile = Join-Path $DataDir 'runtime-instance.json'

function Test-HealthyInstance {
  param([string]$FilePath)
  if (-not (Test-Path -LiteralPath $FilePath)) {
    return $null
  }
  try {
    $info = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $info.url) { return $null }
    $healthUrl = "$($info.url)/health"
    $resp = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
    if ($resp -and $resp.status -eq 'ok' -and $resp.app -eq 'The Virtual Office for Your Work') {
      return $info.url
    }
  } catch {
    return $null
  }
  return $null
}

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "  The Virtual Office for Your Work - Windows Launcher" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan

# 1. Check if a healthy instance is already running
$existingUrl = Test-HealthyInstance -FilePath $RuntimeFile
if ($existingUrl) {
  Write-Host "[Launcher] Healthy application instance already running at $existingUrl" -ForegroundColor Green
  if (-not $NoBrowser) {
    Write-Host "[Launcher] Opening a new tab in your Windows default browser..." -ForegroundColor Green
    Start-Process $existingUrl
  }
  exit 0
}

# 2. Locate Node.js runtime (Prefer bundled runtime\node.exe, fallback to system node.exe)
$BundledNode = Join-Path $AppRoot 'runtime\node.exe'
$NodeExe = $null
if (Test-Path -LiteralPath $BundledNode) {
  $NodeExe = $BundledNode
  Write-Host "[Launcher] Using bundled Node.js runtime: $NodeExe" -ForegroundColor Gray
} else {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) {
    $NodeExe = $cmd.Source
    Write-Host "[Launcher] Using system Node.js runtime: $NodeExe" -ForegroundColor Gray
  }
}

if (-not $NodeExe) {
  Write-Host "[ERROR] Could not locate Node.js runtime (neither bundled runtime\node.exe nor system node.exe)." -ForegroundColor Red
  exit 1
}

$ServerScript = Join-Path $AppRoot 'dist\server\index.mjs'
$ClientIndex = Join-Path $AppRoot 'dist\client\index.html'

if (-not (Test-Path -LiteralPath $ServerScript) -or -not (Test-Path -LiteralPath $ClientIndex)) {
  Write-Host "[ERROR] Production build assets missing at $AppRoot\dist." -ForegroundColor Red
  exit 1
}

# 3. Start the local backend bound to 127.0.0.1 in an independent background process
Write-Host "[Launcher] Starting local server (127.0.0.1)..." -ForegroundColor Yellow

$SpawnedPid = $null
try {
  $startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly
  $startup.ShowWindow = [uint16]0 # SW_HIDE
  $cmdLine = "`"$NodeExe`" `"$ServerScript`""
  # If custom env vars like VIRTUAL_OFFICE_DATA_DIR are set in current session, use Start-Process so env inherits
  if ($env:VIRTUAL_OFFICE_DATA_DIR -or $env:VIRTUAL_OFFICE_PORT) {
    $proc = Start-Process -FilePath $NodeExe -ArgumentList "`"$ServerScript`"" -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
    $SpawnedPid = $proc.Id
  } else {
    $wmiRes = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
      CommandLine = $cmdLine
      CurrentDirectory = $AppRoot
      ProcessStartupInformation = $startup
    }
    if ($wmiRes.ReturnValue -eq 0 -and $wmiRes.ProcessId) {
      $SpawnedPid = [int]$wmiRes.ProcessId
    } else {
      $proc = Start-Process -FilePath $NodeExe -ArgumentList "`"$ServerScript`"" -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
      $SpawnedPid = $proc.Id
    }
  }
} catch {
  $proc = Start-Process -FilePath $NodeExe -ArgumentList "`"$ServerScript`"" -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
  $SpawnedPid = $proc.Id
}

# 4. Wait for /health readiness
$maxAttempts = 40
$readyUrl = $null
for ($i = 1; $i -le $maxAttempts; $i++) {
  Start-Sleep -Milliseconds 250
  $liveProc = Get-Process -Id $SpawnedPid -ErrorAction SilentlyContinue
  if (-not $liveProc) {
    Write-Host "[ERROR] Server process (PID $SpawnedPid) exited unexpectedly." -ForegroundColor Red
    exit 1
  }
  $readyUrl = Test-HealthyInstance -FilePath $RuntimeFile
  if ($readyUrl) {
    break
  }
}

if (-not $readyUrl) {
  Write-Host "[ERROR] Timed out waiting for local server health check (/health)." -ForegroundColor Red
  try {
    Stop-Process -Id $SpawnedPid -Force -ErrorAction SilentlyContinue
  } catch {}
  exit 1
}

Write-Host "[Launcher] Server is ready at $readyUrl (Managed PID: $SpawnedPid)" -ForegroundColor Green

# 5. Open Windows Default Browser
if (-not $NoBrowser) {
  Write-Host "[Launcher] Opening $readyUrl in your default browser..." -ForegroundColor Green
  Start-Process $readyUrl
}

exit 0
