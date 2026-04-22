@echo off
title GR Dashboard Server
color 0A

:start
echo.
echo =======================================
echo   GR Part 현황 Dashboard Server
echo   http://localhost:3000
echo   [Ctrl+C] to stop
echo =======================================
echo.

cd /d "%~dp0"
nodemon server.js --ignore "uploads/" --ignore "*.json" --ignore "*.csv"

echo.
echo [!] Server stopped. Restarting in 3 seconds...
timeout /t 3 /nobreak > nul
goto start
