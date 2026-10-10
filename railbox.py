# -*- coding: utf-8 -*-
"""
晾衣杆 · 主程序

Ctrl+Alt+Space  唤起书写窗
Ctrl+Enter      挂到杆上
Esc             收起

数据住在 01-在杆 / 02-衣柜 / 03-过期未处理 / 04-垃圾桶 四个文件夹里。
"""

import os
import sys
import json
import queue
import threading
import datetime
import webbrowser
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import tkinter as tk
import win32api
import win32con
import win32gui
import win32process
import pystray
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN = 0x0001, 0x0002, 0x0004, 0x0008
WM_HOTKEY = 0x0312
VK_SPACE = 0x20

VAULT = r"D:\OBSIDIAN\Cangku\选题灵感"
HOTKEY_MODS = MOD_CONTROL | MOD_ALT
HOTKEY_VK = VK_SPACE
PANEL_TITLE = "晾衣杆"
PER_ROW = 6
RAILS_OVERRIDE = None      # 想固定层数就改这里（比如 3）；None = 按屏幕自动算

BASE = os.path.dirname(os.path.abspath(__file__))
Q = queue.Queue()
LOG = os.path.join(BASE, "railbox.log")


def log(msg):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write("%s  %s\n" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg))
    except Exception:
        pass


def screen_profile():
    """返回 (逻辑高度, 缩放比例)。逻辑像素 = 物理分辨率 / 缩放。"""
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            import ctypes
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass
    h = win32api.GetSystemMetrics(1)
    scale = 1.0
    try:
        import ctypes
        scale = float(ctypes.windll.user32.GetDpiForSystem()) / 96.0
    except Exception:
        pass
    return h / scale, scale


def auto_rails():
    """留给顶栏和呼吸空间的余量后，能放几层。"""
    if RAILS_OVERRIDE:
        return RAILS_OVERRIDE
    logical, _ = screen_profile()
    avail = logical - 108
    rails = 1
    for n in range(1, 7):
        need = n * 182 + (n - 1) * 34 + 74
        if need + 120 <= avail:
            rails = n
    return rails


CAPACITY = PER_ROW * auto_rails()


# ------------------------------------------------------------------ 来源

def foreground_source():
    """抓当前前台窗口，拼出一个能追溯的来源字符串。"""
    try:
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd) or ""
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        app = ""
        try:
            h = win32api.OpenProcess(win32con.PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
            path = win32process.GetModuleFileNameEx(h, 0)
            app = os.path.splitext(os.path.basename(path))[0]
            win32api.CloseHandle(h)
        except Exception:
            pass
        if not app:
            return title.strip() or "未知来源"
        if title and title.strip() and title.strip().lower() != app.lower():
            return "%s · %s" % (app, title.strip())
        return app
    except Exception:
        return "未知来源"


def clipboard_text():
    try:
        r = tk._default_root
        if r is None:
            return ""
        t = r.clipboard_get()
        return t if isinstance(t, str) else ""
    except Exception:
        return ""


# ------------------------------------------------------------------ 书写窗

class CaptureWindow:
    def __init__(self, root, on_submit):
        self.root = root
        self.on_submit = on_submit
        self.win = None
        self.box = None
        self.hint = None
        self._prefill = ""

    def build(self):
        w = tk.Toplevel(self.root)
        w.overrideredirect(True)
        w.attributes("-topmost", True)
        w.configure(bg="#B0ADA4")
        w.geometry("620x196")
        w.withdraw()

        inner = tk.Frame(w, bg="#FFFFFF")
        inner.pack(fill="both", expand=True, padx=1, pady=1)

        head = tk.Frame(inner, bg="#FFFFFF")
        head.pack(fill="x", padx=18, pady=(14, 0))
        tk.Label(head, text="挂一条灵感", bg="#FFFFFF", fg="#2C2C2A",
                 font=("Microsoft YaHei UI", 10, "bold")).pack(side="left")
        self.src_label = tk.Label(head, text="", bg="#FFFFFF", fg="#9C9A93",
                                  font=("Microsoft YaHei UI", 8))
        self.src_label.pack(side="right")

        self.box = tk.Text(inner, height=4, wrap="word", relief="flat",
                           bg="#FFFFFF", fg="#2C2C2A", insertbackground="#185FA5",
                           font=("Microsoft YaHei UI", 12), padx=0, pady=0)
        self.box.pack(fill="both", expand=True, padx=18, pady=(8, 0))

        foot = tk.Frame(inner, bg="#FFFFFF")
        foot.pack(fill="x", padx=18, pady=(4, 12))
        self.hint = tk.Label(foot, text="Ctrl+Enter 晾上 · Esc 收起", bg="#FFFFFF",
                             fg="#B4B2A9", font=("Microsoft YaHei UI", 8))
        self.hint.pack(side="left")
        tk.Label(foot, text="", bg="#FFFFFF").pack(side="left", expand=True)
        self.count = tk.Label(foot, text="", bg="#FFFFFF", fg="#C4C1B8",
                              font=("Microsoft YaHei UI", 8))
        self.count.pack(side="right")

        self.box.bind("<Control-Return>", self._submit)
        self.box.bind("<KeyRelease>", self._on_key)
        w.bind("<Escape>", lambda e: self.hide())
        w.bind("<FocusOut>", self._on_blur)

        self.win = w
        return w

    def _on_key(self, event=None):
        t = self.box.get("1.0", "end").strip()
        self.count.config(text=("%d 字" % len(t)) if t else "")

    def _on_blur(self, event=None):
        pass

    def _submit(self, event=None):
        text = self.box.get("1.0", "end").strip()
        if text:
            self.on_submit(text, self.src_label.cget("text"))
        self.hide()
        return "break"

    def show(self):
        w = self.win
        self._prefill = clipboard_text().strip()
        self.box.delete("1.0", "end")
        if self._prefill and len(self._prefill) < 400:
            self.box.insert("1.0", self._prefill)
        else:
            self._prefill = ""
        self.src_label.config(text=foreground_source())
        self._on_key()

        w.deiconify()
        w.update_idletasks()
        sw = w.winfo_screenwidth()
        sh = w.winfo_screenheight()
        ww, wh = 620, 196
        w.geometry("%dx%d+%d+%d" % (ww, wh, (sw - ww) // 2, int(sh * 0.32)))
        w.lift()
        w.attributes("-topmost", True)

        try:
            hwnd = int(w.frame(), 16)
            win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
            try:
                win32gui.SetForegroundWindow(hwnd)
            except Exception:
                fg = win32gui.GetForegroundWindow()
                t_fg = win32process.GetWindowThreadProcessId(fg)[0]
                t_me = win32api.GetCurrentThreadId()
                if t_fg != t_me:
                    win32process.AttachThreadInput(t_fg, t_me, True)
                    win32gui.SetForegroundWindow(hwnd)
                    win32process.AttachThreadInput(t_fg, t_me, False)
        except Exception:
            pass

        self.box.focus_force()
        self.box.mark_set("insert", "end-1c")

    def hide(self):
        if self.win:
            self.win.withdraw()


# ------------------------------------------------------------------ 面板服务

class PanelServer:
    def __init__(self, app):
        self.app = app
        self.port = None
        self.httpd = None

    def start(self):
        app = self.app

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, body, ctype="application/json; charset=utf-8"):
                data = body if isinstance(body, bytes) else body.encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.path in ("/", "/index.html"):
                    p = os.path.join(BASE, "panel.html")
                    with open(p, "rb") as f:
                        self._send(200, f.read(), "text/html; charset=utf-8")
                elif self.path.startswith("/api/list"):
                    self._send(200, json.dumps(app.api_list(), ensure_ascii=False))
                else:
                    self._send(404, "{}")

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(n) if n else b"{}"
                try:
                    payload = json.loads(raw.decode("utf-8") or "{}")
                except Exception:
                    payload = {}
                if self.path.startswith("/api/move"):
                    self._send(200, json.dumps(app.api_move(payload), ensure_ascii=False))
                elif self.path.startswith("/api/add"):
                    self._send(200, json.dumps(app.api_add(payload), ensure_ascii=False))
                elif self.path.startswith("/api/wake"):
                    app.wake()
                    self._send(200, json.dumps({"ok": True}))
                elif self.path.startswith("/api/panel"):
                    app.open_panel()
                    self._send(200, json.dumps({"ok": True}))
                elif self.path.startswith("/api/settle"):
                    self._send(200, json.dumps(app.api_settle(), ensure_ascii=False))
                elif self.path.startswith("/api/open"):
                    self._send(200, json.dumps({"ok": app.open_vault_folder()}))
                else:
                    self._send(404, "{}")

        for port in range(8731, 8760):
            try:
                self.httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
                self.port = port
                break
            except OSError:
                continue
        if not self.httpd:
            raise RuntimeError("找不到可用端口")
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        return self.port


# ------------------------------------------------------------------ 应用

def find_edge():
    for c in (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
              r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"):
        if os.path.exists(c):
            return c
    return None


def find_panel_window():
    hits = []

    def cb(hwnd, _):
        if win32gui.IsWindowVisible(hwnd) and win32gui.GetWindowText(hwnd) == PANEL_TITLE:
            hits.append(hwnd)

    try:
        win32gui.EnumWindows(cb, None)
    except Exception:
        pass
    return hits[0] if hits else None


class App:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.capture = CaptureWindow(self.root, self.submit)
        self.capture.build()
        self.server = PanelServer(self)
        self.lock = threading.Lock()
        self.last_settle = None

    # ---------------- 数据 API ----------------

    def _payload(self):
        ideas = store.scan(VAULT)
        hanging = [i for i in ideas if i["status"] == "hanging"]
        capacity = CAPACITY
        out = []
        for idx, i in enumerate(ideas):
            out.append({
                "id": i["id"], "text": i["text"], "source": i["source"],
                "clip": i["clip"], "pinned": i["pinned"], "status": i["status"],
                "age": i["age_days"], "filename": i["filename"],
                "created": i["created"], "doom": bool(i.get("doom_at")),
                "hours_left": self._hours_left(i),
            })
        order = {"hanging": 0, "closet": 1, "expired": 2, "trash": 3}
        for i in out:
            i["_o"] = order.get(i["status"], 9)
        out.sort(key=lambda x: (x["_o"], x["created"]), reverse=False)
        return {
            "ideas": out,
            "capacity": capacity,
            "hanging": len(hanging),
            "full": len(hanging) >= capacity,
            "counts": {k: len([x for x in ideas if x["status"] == k]) for k, _ in store.FOLDERS},
            "vault": VAULT,
        }

    def _hours_left(self, idea):
        if not idea.get("doom_at"):
            return None
        d = store.parse_dt(idea["doom_at"])
        if not d:
            return None
        used = (datetime.datetime.now() - d).total_seconds() / 3600.0
        return max(0, int(store.DOOM_HOURS - used))

    def api_list(self):
        with self.lock:
            return self._payload()

    def api_move(self, p):
        with self.lock:
            ideas = store.scan(VAULT)
            target = [i for i in ideas if i["id"] == p.get("id")]
            if not target:
                return {"ok": False, "error": "not found"}
            i = target[0]
            status = p.get("status")
            if status == "pin":
                i["pinned"] = not i["pinned"]
                i["history"].append("%s · %s" % (
                    store.fmt(datetime.datetime.now()),
                    "钉住" if i["pinned"] else "取消钉住"))
                store._save(i, VAULT)
            elif status in store.KEY_TO_DIR:
                store.move(VAULT, i, status, p.get("reason") or self._default_reason(status))
            return self._payload()

    def _default_reason(self, status):
        return {"closet": "我主动归档", "trash": "我主动删除",
                "hanging": "我还原回杆上", "expired": "手动移入"}.get(status, "")

    def api_add(self, p):
        with self.lock:
            text = (p.get("text") or "").strip()
            if text:
                store.add(VAULT, text, p.get("source") or "手动添加", p.get("clip") or "blue")
            return self._payload()

    def api_settle(self):
        with self.lock:
            r = store.settle(VAULT, CAPACITY)
            payload = self._payload()
            payload["settle"] = {
                "marked": [i["filename"] for i in r["marked"]],
                "moved": [i["filename"] for i in r["moved"]],
            }
            return payload

    def open_vault_folder(self):
        try:
            os.startfile(VAULT)
            return True
        except Exception:
            return False

    # ---------------- 动作 ----------------

    def submit(self, text, source):
        with self.lock:
            idea = store.add(VAULT, text, source or foreground_source(), "blue")
            log("挂上：%s" % idea["filename"])
        Q.put(("toast", "已挂上 · %s" % source))

    def wake(self):
        log("唤起书写窗")
        Q.put(("capture", None))

    def open_panel(self):
        port = self.server.port
        if port is None:
            port = self.server.start()
        hwnd = find_panel_window()
        if hwnd:
            try:
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(hwnd)
                return
            except Exception:
                pass
        url = "http://127.0.0.1:%d/" % port
        edge = find_edge()
        if edge:
            subprocess.Popen([edge, "--app=" + url,
                              "--window-size=1500,1000",
                              "--user-data-dir=" + os.path.join(BASE, ".edgeprofile")],
                             creationflags=0x00000008)
        else:
            webbrowser.open(url)

    def quit(self):
        Q.put(("quit", None))

    # ---------------- 消息泵 ----------------

    def pump(self):
        try:
            while True:
                kind, payload = Q.get_nowait()
                if kind == "capture":
                    self.capture.show()
                elif kind == "toast":
                    print("[railbox]", payload)
                elif kind == "quit":
                    try:
                        if self.server.httpd:
                            self.server.httpd.shutdown()
                    except Exception:
                        pass
                    self.root.quit()
                    self.root.destroy()
                    return
        except queue.Empty:
            pass
        self.root.after(70, self.pump)

    def run(self):
        log("=== 启动 ===")
        log("仓库：%s" % VAULT)
        try:
            lh, sc = screen_profile()
            log("屏幕：逻辑高 %.0f，缩放 %.2f，层数 %d，容量 %d" % (lh, sc, auto_rails(), CAPACITY))
        except Exception as e:
            log("屏幕探测失败：%r" % (e,))
        store.ensure_vault(VAULT)
        self.server.start()
        log("面板服务：http://127.0.0.1:%d/" % self.server.port)
        threading.Thread(target=self._hotkey_loop, daemon=True).start()
        threading.Thread(target=self._tray_loop, daemon=True).start()
        self.root.after(600, self._first_settle)
        self.pump()
        try:
            self.root.mainloop()
        except Exception as e:
            log("主循环异常：%r" % (e,))
        log("=== 退出 ===")

    def _first_settle(self):
        try:
            with self.lock:
                store.settle(VAULT, CAPACITY)
        except Exception:
            pass

    def _hotkey_loop(self):
        def on_hotkey(hwnd, msg, wparam, lparam):
            Q.put(("capture", None))
            return 0

        def on_destroy(hwnd, msg, wparam, lparam):
            win32gui.PostQuitMessage(0)
            return 0

        wc = win32gui.WNDCLASS()
        wc.lpszClassName = "RailBoxHotkeyWnd"
        wc.hInstance = win32api.GetModuleHandle(None)
        wc.lpfnWndProc = {WM_HOTKEY: on_hotkey, win32con.WM_DESTROY: on_destroy}
        atom = win32gui.RegisterClass(wc)
        hwnd = win32gui.CreateWindow(atom, "RailBoxHotkey", 0, 0, 0, 0, 0, 0, 0, wc.hInstance, None)
        # pywin32 的 RegisterHotKey 成功返回 None，失败抛异常
        try:
            win32gui.RegisterHotKey(hwnd, 1, HOTKEY_MODS, HOTKEY_VK)
            log("热键 Ctrl+Alt+Space 注册成功")
        except Exception as e:
            log("热键注册失败：%r" % (e,))
            print("[railbox] 热键注册失败，可能被其他程序占用：%r" % (e,))
        win32gui.PumpMessages()

    def _tray_loop(self):
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.line([(6, 16), (58, 16)], fill=(44, 44, 42, 255), width=4)
        for x, c in ((17, (163, 45, 45, 255)), (32, (24, 95, 165, 255)), (47, (133, 79, 11, 255))):
            d.rectangle([x - 5, 16, x + 5, 38], fill=c)
        d.rectangle([10, 40, 54, 50], fill=(226, 223, 216, 255))

        menu = pystray.Menu(
            pystray.MenuItem("打开衣杆", lambda i, it: self.open_panel(), default=True),
            pystray.MenuItem("挂一条灵感  Ctrl+Alt+Space", lambda i, it: self.wake()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("打开灵感箱文件夹", lambda i, it: self.open_vault_folder()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("退出", lambda i, it: self.quit()),
        )
        icon = pystray.Icon("railbox", img, "晾衣杆", menu)
        icon.run()


if __name__ == "__main__":
    App().run()
