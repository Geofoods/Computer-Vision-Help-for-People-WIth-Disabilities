@echo off
title HandTap — Spatial Assistive Input
cd /d "%~dp0"

echo ===================================================
echo   Starting HandTap (Desktop App + Real Mouse Control)
echo ===================================================
echo.

call npm run desktop:dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ---------------------------------------------------
    echo An error occurred while running HandTap.
    echo ---------------------------------------------------
    pause
)

