@echo off
cd /d "%~dp0"
py setup.py
if errorlevel 1 pause
