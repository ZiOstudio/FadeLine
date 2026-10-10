# -*- coding: utf-8 -*-
"""用真实窗口句柄逐个实测热键，和正式程序用同一条路径。"""

import os
import json
import ctypes
import win32api
import win32con
import win32gui

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN = 1, 2, 4, 8
R = {"results": {}, "diag": {}}


class Probe(object):
    def __init__(self):
        wc = win32gui.WNDCLASS()
        wc.lpszClassName = "RailHotkeyProbe"
        wc.hInstance = win32api.GetModuleHandle(None)
        wc.lpfnWndProc = {win32con.WM_DESTROY: lambda *a: 0}
        try:
            cls = win32gui.RegisterClass(wc)
        except Exception:
            cls = wc.lpszClassName
        self.hwnd = win32gui.CreateWindow(cls, "probe", 0, 0, 0, 0, 0, 0, 0, wc.hInstance, None)

    def test(self, mods, vk):
        # pywin32 的 RegisterHotKey 成功返回 None，失败才抛异常
        try:
            win32gui.RegisterHotKey(self.hwnd, 1, mods, vk)
        except Exception:
            return "TAKEN"
        try:
            win32gui.UnregisterHotKey(self.hwnd, 1)
        except Exception:
            pass
        return "free"


p = Probe()
R["diag"]["hwnd"] = p.hwnd
R["diag"]["hwnd_valid"] = bool(p.hwnd) and win32gui.IsWindow(p.hwnd)

VK = {"Space": 0x20, "Q": 0x51, "W": 0x57, "E": 0x45, "A": 0x41, "S": 0x53, "D": 0x44,
      "X": 0x58, "Z": 0x5A, "C": 0x43, "V": 0x56, "N": 0x4E, "B": 0x42, "M": 0x4D,
      "Backquote": 0xC0, "F7": 0x76, "F8": 0x77, "F9": 0x78, "F10": 0x79, "F6": 0x75}

cands = [
    ("Ctrl+Alt+Space", MOD_CONTROL | MOD_ALT, "Space"),
    ("Ctrl+Alt+Q", MOD_CONTROL | MOD_ALT, "Q"),
    ("Ctrl+Alt+X", MOD_CONTROL | MOD_ALT, "X"),
    ("Ctrl+Alt+Z", MOD_CONTROL | MOD_ALT, "Z"),
    ("Ctrl+Alt+D", MOD_CONTROL | MOD_ALT, "D"),
    ("Ctrl+Alt+N", MOD_CONTROL | MOD_ALT, "N"),
    ("Ctrl+Alt+B", MOD_CONTROL | MOD_ALT, "B"),
    ("Ctrl+Shift+Space", MOD_CONTROL | MOD_SHIFT, "Space"),
    ("Ctrl+Shift+Q", MOD_CONTROL | MOD_SHIFT, "Q"),
    ("Ctrl+Shift+A", MOD_CONTROL | MOD_SHIFT, "A"),
    ("Alt+Shift+Space", MOD_ALT | MOD_SHIFT, "Space"),
    ("Alt+Q", MOD_ALT, "Q"),
    ("Alt+X", MOD_ALT, "X"),
    ("Alt+C", MOD_ALT, "C"),
    ("Alt+Backquote", MOD_ALT, "Backquote"),
    ("F7", 0, "F7"),
    ("F8", 0, "F8"),
    ("F9", 0, "F9"),
    ("F10", 0, "F10"),
]

for name, mods, key in cands:
    R["results"][name] = p.test(mods, VK[key])

out = os.path.join(os.environ.get("TEMP", "."), "hotkeytest.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=2)
print(out)
