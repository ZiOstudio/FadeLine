@echo off
chcp 65001 >nul
cd /d D:\RailBox
if exist "D:\Python\Python3146\pythonw.exe" (
  start "" "D:\Python\Python3146\pythonw.exe" "D:\RailBox\railbox.py"
) else (
  start "" pythonw.exe "D:\RailBox\railbox.py"
)
