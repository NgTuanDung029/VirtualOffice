@echo off
setlocal
set "APP_DIR=%~dp0"
if exist "%APP_DIR%scripts\launcher.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%scripts\launcher.ps1" %*
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%launcher.ps1" %*
)
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [Virtual Office] Startup encountered an error. Review the diagnostic messages above.
  if "%1"=="" pause
  exit /b %ERRORLEVEL%
)
exit /b 0
