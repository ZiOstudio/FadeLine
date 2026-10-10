@echo off
chcp 65001 >nul
taskkill /f /im electron.exe >nul 2>&1
timeout /t 1 /nobreak >nul
cd /d D:\RailBox\overlay
start "" "D:\RailBox\overlay\node_modules\electron\dist\electron.exe" "D:\RailBox\overlay"
