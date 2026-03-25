@echo off
setlocal

cd /d "%~dp0"
title Cutie Trae Dev Watch

echo Starting Cutie watch + sync for Trae...
echo Keep this window open while you work, then reload Trae to pick up changes.
echo.

call npm.cmd run watch:trae
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo watch:trae exited with code %RC%.
  pause
)

exit /b %RC%
