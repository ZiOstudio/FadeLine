# -*- coding: utf-8 -*-
"""
检测当前是否处于全屏/游戏状态，顺带返回前台进程名。

输出 base64(UTF-8 JSON)：{"state": 5, "app": "chrome"}

state 含义（SHQueryUserNotificationState，shell32.dll）：
  1 QUNS_NOT_PRESENT          不在场
  2 QUNS_BUSY                 有全屏窗口 / 演示（宽泛，全屏看视频也可能命中）
  3 QUNS_RUNNING_D3D_FULL_SCREEN  全屏独占 D3D 应用（基本就是全屏游戏，判定可靠）
  4 QUNS_PRESENTATION_MODE    投屏演示
  5 QUNS_ACCEPTS_NOTIFICATIONS 正常桌面
  6 QUNS_QUIET_TIME           安静时间
"""

import base64
import ctypes
import json
import os
import sys


def main():
    result = {"state": 5, "app": ""}

    try:
        pquns = ctypes.c_int()
        hr = ctypes.windll.shell32.SHQueryUserNotificationState(ctypes.byref(pquns))
        if hr == 0:
            result["state"] = int(pquns.value)
    except Exception:
        pass

    try:
        import win32api
        import win32con
        import win32gui
        import win32process

        hwnd = win32gui.GetForegroundWindow()
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        h = win32api.OpenProcess(win32con.PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        app = os.path.splitext(os.path.basename(win32process.GetModuleFileNameEx(h, 0)))[0]
        win32api.CloseHandle(h)
        result["app"] = app.lower()
    except Exception:
        pass

    raw = json.dumps(result, ensure_ascii=False).encode("utf-8")
    sys.stdout.write(base64.b64encode(raw).decode("ascii"))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
