@echo off
chcp 65001 >nul
title 打包 · 晾衣杆
cd /d "%~dp0overlay"

echo.
echo   打包「晾衣杆」
echo   ================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [失败] 没找到 Node.js。
  echo   装一下： https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo   还没装依赖，先装一次（约 100 MB）...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [失败] 依赖没装上。往上翻看错误信息。
    pause
    exit /b 1
  )
  echo.
)

if exist "node_modules\electron-builder" (
  echo   用 electron-builder 打包（产出单个 exe）...
  echo.
  call npx electron-builder --win --x64
  if errorlevel 1 (
    echo.
    echo   [失败] 打包没成功。往上翻看错误信息。
    pause
    exit /b 1
  )
) else (
  echo   没装 electron-builder —— 改用「手工组装」。
  echo   效果一样，只是产物是个压缩包而不是单个 exe，不需要额外装工具。
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "dev\package-portable.ps1"
  if errorlevel 1 (
    echo.
    echo   [失败] 打包没成功。往上翻看错误信息。
    pause
    exit /b 1
  )
)

echo.
echo   ================================================
echo   打包完成！成品在这个文件夹里：
echo     %~dp0dist\
echo.
for %%f in ("%~dp0dist\*.zip" "%~dp0dist\*.exe") do echo     %%~nxf   (%%~zf 字节)
echo.
echo   下一步：把这个文件传到 GitHub 的 Releases 页面
echo   ^(不是 git 仓库里 —— 它有上百 MB，塞进仓库会越滚越大^)
echo.
pause
