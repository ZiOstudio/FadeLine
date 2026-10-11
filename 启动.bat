@echo off
chcp 65001 >nul
title 晾衣杆
cd /d "%~dp0overlay"

echo.
echo   晾衣杆 · 灵感墙
echo   ============================================
echo.

if not exist "node_modules\electron\dist\electron.exe" (
  echo   首次运行，需要先下载依赖（约 100 MB）。
  echo   这一步只需要 Node.js，装一次以后就不用了。
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [失败] 依赖没装上。
    echo   请先安装 Node.js： https://nodejs.org   然后重新双击本文件。
    echo.
    pause
    exit /b 1
  )
  echo.
  echo   依赖就绪。
  echo.
)

start "" "%~dp0overlay\node_modules\electron\dist\electron.exe" "%~dp0overlay"
exit /b 0
