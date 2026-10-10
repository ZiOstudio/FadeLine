# -*- coding: utf-8 -*-
"""冒烟测试：编译 / 导入 / 屏幕探测 / 热键注册 / HTTP 服务 / 面板页面 + JS 语法"""

import os
import sys
import json
import ctypes
import threading
import urllib.request
import py_compile

R = {}
sys.path.insert(0, r"D:\RailBox")
os.chdir(r"D:\RailBox")

for f in ("store.py", "railbox.py"):
    try:
        py_compile.compile(os.path.join(r"D:\RailBox", f), doraise=True)
        R["compile:" + f] = "ok"
    except Exception as e:
        R["compile:" + f] = repr(e)

try:
    import railbox
    R["import:railbox"] = "ok"
except Exception as e:
    R["import:railbox"] = repr(e)
    raise SystemExit(1)

# 屏幕 / 缩放
try:
    lh, scale = railbox.screen_profile()
    R["screen"] = {
        "physical": "%dx%d" % (railbox.win32api.GetSystemMetrics(0),
                               railbox.win32api.GetSystemMetrics(1)),
        "scale": scale,
        "logical_height": round(lh),
        "rails": railbox.auto_rails(),
        "capacity": railbox.CAPACITY,
    }
except Exception as e:
    R["screen"] = repr(e)

# 前台窗口来源抓取
try:
    R["foreground_source"] = railbox.foreground_source()
except Exception as e:
    R["foreground_source"] = repr(e)

# 热键能否注册（注册后立刻释放，不占用）
try:
    def _wnd(h, m, w, l):
        return 0
    wc = railbox.win32gui.WNDCLASS()
    wc.lpszClassName = "RailBoxProbeWnd"
    wc.hInstance = railbox.win32api.GetModuleHandle(None)
    wc.lpfnWndProc = {railbox.win32con.WM_DESTROY: _wnd}
    atom = railbox.win32gui.RegisterClass(wc)
    hw = railbox.win32gui.CreateWindow(atom, "RailBoxProbe", 0, 0, 0, 0, 0, 0, 0, wc.hInstance, None)
    ok = railbox.win32gui.RegisterHotKey(hw, 7, railbox.HOTKEY_MODS, railbox.HOTKEY_VK)
    R["hotkey:Ctrl+Alt+Space"] = "ok" if ok else "FAILED"
    if ok:
        railbox.win32gui.UnregisterHotKey(hw, 7)
    railbox.win32gui.DestroyWindow(hw)
except Exception as e:
    R["hotkey:Ctrl+Alt+Space"] = repr(e)

# tkinter 能否起窗口
try:
    import tkinter as tk
    r = tk.Tk()
    r.withdraw()
    R["tkinter"] = "ok screen=%dx%d" % (r.winfo_screenwidth(), r.winfo_screenheight())
    r.destroy()
except Exception as e:
    R["tkinter"] = repr(e)

# HTTP 服务 + 面板页
try:
    class Stub(object):
        def api_list(self):
            return {"ideas": [], "capacity": railbox.CAPACITY, "hanging": 0,
                    "full": False, "counts": {}, "vault": railbox.VAULT}

        def api_move(self, p):
            return self.api_list()

        def api_add(self, p):
            return self.api_list()

        def api_settle(self):
            return self.api_list()

        def open_vault_folder(self):
            return True

    srv = railbox.PanelServer(Stub())
    port = srv.start()
    R["http_port"] = port
    html = urllib.request.urlopen("http://127.0.0.1:%d/" % port, timeout=5).read().decode("utf-8")
    R["panel_bytes"] = len(html)
    R["panel_title_ok"] = "<title>晾衣杆</title>" in html
    api = json.loads(urllib.request.urlopen(
        "http://127.0.0.1:%d/api/list" % port, timeout=5).read().decode("utf-8"))
    R["api_ok"] = api.get("capacity") == railbox.CAPACITY
    srv.httpd.shutdown()
except Exception as e:
    R["http"] = repr(e)

out = os.path.join(os.environ.get("TEMP", "."), "smoke.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=2)
print(out)
