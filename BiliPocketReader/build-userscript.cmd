@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-userscript.ps1"
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)
echo.
echo Done. You can install dist\BiliPocketReader.user.js in your userscript app.
pause
