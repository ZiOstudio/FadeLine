# -*- coding: utf-8 -*-
"""用真实鼠标输入流（SendInput 绝对移动）移到目标点并左键单击，最后复原鼠标位置。

和 SetCursorPos 的区别：SendInput 走的是完整的输入栈，会产生标准的 WM_MOUSEMOVE，
这样 Electron 的「forward: true」转发机制才会把移动事件送到渲染进程。

用法：python click_at.py <x> <y>
"""
import ctypes
import sys
import time
from ctypes import wintypes

u32 = ctypes.WinDLL("user32", use_last_error=True)
u32.SendInput.argtypes = (wintypes.UINT, ctypes.c_void_p, ctypes.c_int)
u32.SendInput.restype = wintypes.UINT

ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_ulong

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_ABSOLUTE = 0x8000
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
VK = {'escape': 0x1B, 'enter': 0x0D, 'tab': 0x09, 'space': 0x20}

SM_CXSCREEN, SM_CYSCREEN = 0, 1


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [("dx", ctypes.c_long), ("dy", ctypes.c_long), ("mouseData", wintypes.DWORD),
                ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]


class _UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("pad", ctypes.c_byte * 32)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", _UNION)]


class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


def send(dx, dy, flags):
    inp = INPUT()
    inp.type = 0                    # INPUT_MOUSE
    inp.u.mi.dx = dx
    inp.u.mi.dy = dy
    inp.u.mi.dwFlags = flags
    return u32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def move_to(x, y, sw, sh):
    return send(int(x * 65535 / (sw - 1)), int(y * 65535 / (sh - 1)),
                MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)


def send_key(vk):
    ok = 0
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.u.ki.wVk = vk
    ok += u32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
    inp.u.ki.dwFlags = KEYEVENTF_KEYUP
    ok += u32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
    return ok


def main():
    # 模式一：click_at.py key escape  → 按一个键
    if len(sys.argv) > 2 and sys.argv[1] == 'key':
        name = sys.argv[2].lower()
        vk = VK.get(name)
        if vk is None:
            print('unknown key: ' + name)
            return
        time.sleep(0.2)
        print('key %s (vk=0x%02X) sendinput_ok=%d' % (name, vk, send_key(vk)))
        return

    # 模式二：click_at.py <x> <y> [move]  → 移到坐标并点击（move = 只移动不点击）
    x, y = int(sys.argv[1]), int(sys.argv[2])
    move_only = len(sys.argv) > 3 and sys.argv[3] == 'move'
    sw = u32.GetSystemMetrics(SM_CXSCREEN)
    sh = u32.GetSystemMetrics(SM_CYSCREEN)
    pt = POINT()
    u32.GetCursorPos(ctypes.byref(pt))
    old = (pt.x, pt.y)

    ok = 0
    # 分三步靠近，确保产生真实的移动事件流
    ok += move_to(x - 120, y - 60, sw, sh)
    time.sleep(0.20)
    ok += move_to(x - 20, y - 8, sw, sh)
    time.sleep(0.20)
    ok += move_to(x, y, sw, sh)
    time.sleep(0.45)                 # 留足时间让渲染进程运行 pointermove 并解除鼠标穿透

    if not move_only:
        ok += send(0, 0, MOUSEEVENTF_LEFTDOWN)
        time.sleep(0.08)
        ok += send(0, 0, MOUSEEVENTF_LEFTUP)
        time.sleep(0.35)
        move_to(old[0], old[1], sw, sh)

    print("%s=(%d,%d) screen=%dx%d restored=(%d,%d) sendinput_ok=%d"
          % ('move_to' if move_only else 'click_at', x, y, sw, sh, old[0], old[1], ok))


if __name__ == "__main__":
    main()
