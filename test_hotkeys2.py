# -*- coding: utf-8 -*-
"""
热键占用实测 —— ctypes 直调 user32，取真实返回值和 GetLastError。
带对照组：Win+Q / Win+R / Win+E 是系统保留组合，必须报 TAKEN，否则测试无效。
"""

import os
import json
import ctypes
from ctypes import wintypes

import win32api
import win32con
import win32gui

u32 = ctypes.WinDLL("user32", use_last_error=True)
u32.RegisterHotKey.argtypes = (wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT)
u32.RegisterHotKey.restype = wintypes.BOOL
u32.UnregisterHotKey.argtypes = (wintypes.HWND, ctypes.c_int)
u32.UnregisterHotKey.restype = wintypes.BOOL

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN = 1, 2, 4, 8
ERROR_HOTKEY_ALREADY_REGISTERED = 1409
R = {"results": {}, "errors": {}, "diag": {}}

wc = win32gui.WNDCLASS()
wc.lpszClassName = "RailHKProbe2"
wc.hInstance = win32api.GetModuleHandle(None)
wc.lpfnWndProc = {win32con.WM_DESTROY: lambda *a: 0}
try:
    cls = win32gui.RegisterClass(wc)
except Exception:
    cls = wc.lpszClassName
HWND = win32gui.CreateWindow(cls, "probe2", 0, 0, 0, 0, 0, 0, 0, wc.hInstance, None)
R["diag"] = {"hwnd": HWND, "valid": bool(win32gui.IsWindow(HWND))}

VK = {"Space": 0x20, "Q": 0x51, "R": 0x52, "E": 0x45, "W": 0x57, "A": 0x41,
      "X": 0x58, "Z": 0x5A, "C": 0x43, "D": 0x44, "N": 0x4E, "B": 0x42,
      "Backquote": 0xC0, "F7": 0x76, "F8": 0x77, "F9": 0x78, "F10": 0x79}

CANDIDATES = [
    ("[对照] Win+Q", MOD_WIN, "Q"),
    ("[对照] Win+R", MOD_WIN, "R"),
    ("[对照] Win+E", MOD_WIN, "E"),
    ("Ctrl+Alt+Space", MOD_CONTROL | MOD_ALT, "Space"),
    ("Ctrl+Alt+Q", MOD_CONTROL | MOD_ALT, "Q"),
    ("Ctrl+Alt+X", MOD_CONTROL | MOD_ALT, "X"),
    ("Ctrl+Alt+Z", MOD_CONTROL | MOD_ALT, "Z"),
    ("Ctrl+Alt+D", MOD_CONTROL | MOD_ALT, "D"),
    ("Ctrl+Alt+N", MOD_CONTROL | MOD_ALT, "N"),
    ("Ctrl+Alt+B", MOD_CONTROL | MOD_ALT, "B"),
    ("Ctrl+Shift+Space", MOD_CONTROL | MOD_SHIFT, "Space"),
    ("Alt+Shift+Space", MOD_ALT | MOD_SHIFT, "Space"),
    ("Alt+Q", MOD_ALT, "Q"),
    ("Alt+A", MOD_ALT, "A"),
    ("Alt+X", MOD_ALT, "X"),
    ("Alt+Z", MOD_ALT, "Z"),
    ("Alt+Backquote", MOD_ALT, "Backquote"),
    ("F8", 0, "F8"),
    ("F9", 0, "F9"),
    ("F10", 0, "F10"),
]

hits = 0
for name, mods, key in CANDIDATES:
    hits += 1
    ctypes.set_last_error(0)
    ok = u32.RegisterHotKey(HWND, hits, mods, VK[key])
    err = ctypes.get_last_error()
    if ok:
        u32.UnregisterHotKey(HWND, hits)
        R["results"][name] = "free"
    else:
        R["results"][name] = "TAKEN"
        R["errors"][name] = err

# 对照校验
controls = [R["results"][k] for k in R["results"] if k.startswith("[对照]")]
R["diag"]["controls_all_taken"] = all(c == "TAKEN" for c in controls)
R["diag"]["test_valid"] = R["diag"]["controls_all_taken"]

out = os.path.join(os.environ.get("TEMP", "."), "hktest2.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=2)
print(out)
