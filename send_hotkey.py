# -*- coding: utf-8 -*-
"""模拟按下 Ctrl+Alt+<键>，验证热键投递链路。
用法：python send_hotkey.py [q|space]  默认 q"""

import ctypes
import sys
import time
from ctypes import wintypes

u32 = ctypes.WinDLL("user32", use_last_error=True)
u32.SendInput.argtypes = (wintypes.UINT, ctypes.c_void_p, ctypes.c_int)
u32.SendInput.restype = wintypes.UINT

KEYEVENTF_KEYUP = 0x0002
VK_CONTROL, VK_MENU = 0x11, 0x12
KEYS = {"q": 0x51, "space": 0x20, "x": 0x58, "z": 0x5A}
ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_ulong


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                ("dwExtraInfo", ULONG_PTR)]


class _UNION(ctypes.Union):
    _fields_ = [("ki", KEYBDINPUT), ("pad", ctypes.c_byte * 32)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", _UNION)]


def key(vk, up=False):
    inp = INPUT()
    inp.type = 1
    inp.u.ki.wVk = vk
    inp.u.ki.dwFlags = KEYEVENTF_KEYUP if up else 0
    return u32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def chord(vk):
    n = 0
    n += key(VK_CONTROL); time.sleep(0.02)
    n += key(VK_MENU);    time.sleep(0.02)
    n += key(vk);         time.sleep(0.08)
    n += key(vk, True)
    n += key(VK_MENU, True)
    n += key(VK_CONTROL, True)
    return n


which = (sys.argv[1] if len(sys.argv) > 1 else "q").lower()
vk = KEYS.get(which, KEYS["q"])
print("sizeof(INPUT)=%d  key=%s  sendinput_ok=%d" % (ctypes.sizeof(INPUT), which, chord(vk)))
