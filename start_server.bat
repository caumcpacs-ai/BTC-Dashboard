@echo off
title GR Dashboard Server
color 0A

cd /d "%~dp0"

echo =======================================
echo   GR Part 현황 Dashboard Server
echo   Checking environment...
echo =======================================

:: Check if port 3000 is already in use
netstat -ano | findstr :3000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo [!] Port 3000 is already in use. 
    echo [!] The server might be already running.
    echo [!] Opening browser...
    start http://localhost:3000
    timeout /t 5
    exit
)

echo [!] Starting server and opening browser...
start http://localhost:3000

:start
echo.
echo =======================================
echo   Server is running at http://localhost:3000
echo   [Ctrl+C] to stop
echo =======================================
echo.

npm run dev

echo.
echo [!] Server stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak > nul
goto start
