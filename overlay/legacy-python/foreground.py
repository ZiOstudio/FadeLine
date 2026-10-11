# -*- coding: utf-8 -*-
"""
抓当前前台窗口，以 base64(UTF-8 JSON) 输出。

为什么用 base64：Windows 上 Python 往管道写 stdout 时用的是系统本地编码（中文系统是 cp936），
Node 按 UTF-8 解码就会变成乱码。base64 是纯 ASCII，彻底绕开这个坑。
"""

import base64
import json
import os
import sys


def main():
    data = {"app": "", "title": ""}
    try:
        import win32api
        import win32con
        import win32gui
        import win32process

        hwnd = win32gui.GetForegroundWindow()
        title = (win32gui.GetWindowText(hwnd) or "").strip()
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        app = ""
        try:
            h = win32api.OpenProcess(win32con.PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
            app = os.path.splitext(os.path.basename(win32process.GetModuleFileNameEx(h, 0)))[0]
            win32api.CloseHandle(h)
        except Exception:
            pass
        data = {"app": app, "title": title}
    except Exception:
        pass

    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    sys.stdout.write(base64.b64encode(raw).decode("ascii"))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
