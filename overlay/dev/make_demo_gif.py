# -*- coding: utf-8 -*-
"""录一段 README 用的演示 GIF：悬停聚焦 → 点开卡片编辑 → 顶边收起 → 热键放下。

前置条件（缺一个都会录成空桌面或点空）：

  1. `overlay/config.json` 的 `vault` 指到一个**有真卡片**的目录。
     注意 demoMode 的假卡片点不动 —— `overlay.html` 的 openInlineEditor 开头就把
     `__demo` 开头的 id 挡掉了。可以拿 dev/seed20.js 灌一批（目录必须先存在）：
         node dev/seed20.js "D:\\某个临时目录"
  2. 关掉桌面上会挡住绳子的窗口。DSH 自己的窗口也在浮层之上，脚本会把标题带
     "DeepSeek Harness" 的窗口先最小化，录完恢复。
  3. 需要 `ffmpeg`（找得到 D:\\ffmpeg.exe 或 PATH 里有）。注意 2021 那版构建**没有 libx264**，
     所以这里直接录成 PNG 帧序列，再两遍调色板转 GIF。
  4. Python 需要 Pillow（用来抽查每帧的绳子像素，确认真的录到了东西）。

用法：
    python dev/make_demo_gif.py [输出路径，默认 ../../docs/demo.gif]
"""
import ctypes
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAY = os.path.dirname(HERE)
ROOT = os.path.dirname(OVERLAY)
CLICK = os.path.join(HERE, 'click_at.py')
OUT = os.path.normpath(os.path.join(ROOT, 'docs', 'demo.gif'))

# 屏幕缩放：物理像素 = 逻辑像素 × 这个数（150% 缩放就是 1.5）。
# 下面两个裁剪量是物理像素，对应「绳子真正占用的那一段」，顺手把任务栏排除掉。
SCALE = 1.5
CROP_TOP = 135
CROP_HEIGHT = 1680
SECONDS = 13
WIDTH = 780

u32 = ctypes.WinDLL('user32', use_last_error=True)


def find_ffmpeg():
    for cand in (r'D:\ffmpeg.exe', shutil.which('ffmpeg')):
        if cand and os.path.exists(cand):
            return cand
    raise SystemExit('找不到 ffmpeg（可以设 D:\\ffmpeg.exe 或放进 PATH）')


def drive(*args):
    """调 click_at.py：`<x> <y> [move]` / `key <name>` / `combo ctrl+alt+q`。"""
    subprocess.run([sys.executable, CLICK] + [str(a) for a in args], capture_output=True)
    time.sleep(0.15)


def minimize_blockers():
    """把会挡住浮层的窗口最小化（目前只需要处理 DSH 自己），返回句柄列表。"""
    handles = []
    try:
        import ctypes.wintypes as wt
        user32 = ctypes.WinDLL('user32')
        EnumWindows = user32.EnumWindows
        proc = ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)

        def cb(hwnd, _):
            if not user32.IsWindowVisible(hwnd):
                return True
            buf = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, buf, 512)
            if 'DeepSeek Harness' in buf.value:
                user32.ShowWindow(hwnd, 6)          # SW_MINIMIZE
                handles.append(hwnd)
            return True

        EnumWindows(proc(cb), 0)
    except Exception as e:
        print('（没能最小化窗口：%s）' % e)
    return handles


def restore(handles):
    for h in handles:
        try:
            u32.ShowWindow(h, 9)                    # SW_RESTORE
        except Exception:
            pass


def rope_pixels(path):
    """抽查一帧里「卡片米色」的占比，用来确认录到的是绳子而不是空桌面。"""
    img = Image.open(path).convert('RGB').resize((300, 131))
    px = img.load()
    hits = total = 0
    for y in range(0, 131, 4):
        for x in range(0, 300, 4):
            r, g, b = px[x, y]
            total += 1
            if r > 190 and g > 165 and b > 120 and abs(r - g) < 45 and (r - b) > 25:
                hits += 1
    return hits / total


def main():
    out = os.path.normpath(sys.argv[1]) if len(sys.argv) > 1 else OUT
    ffmpeg = find_ffmpeg()
    sw, sh = u32.GetSystemMetrics(0), u32.GetSystemMetrics(1)
    print('屏幕逻辑尺寸 %dx%d · 缩放 %.2f' % (sw, sh, SCALE))

    tmp = tempfile.mkdtemp(prefix='fadeline-demo-')
    frames_pat = os.path.join(tmp, 'f-%03d.png')
    pal = os.path.join(tmp, 'palette.png')

    handles = minimize_blockers()
    time.sleep(1.0)

    drive('key', 'escape')           # 万一有编辑窗开着
    drive(sw // 2, 130, 'move')      # 停在绳子上方的空白处：三根绳都是清晰状态

    rec = subprocess.Popen([
        ffmpeg, '-hide_banner', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '15',
        '-offset_x', '0', '-offset_y', str(CROP_TOP),
        '-video_size', '3840x%d' % CROP_HEIGHT, '-i', 'desktop',
        '-t', str(SECONDS), '-vf', 'fps=12,scale=%d:-2:flags=lanczos' % WIDTH,
        '-y', frames_pat,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    time.sleep(0.7)
    drive(int(sw * 0.46), 300, 'move')      # 悬停第 1 根绳 → 聚焦，另外两根变暗
    drive(int(sw * 0.61), 300, 'move')      # 沿绳滑到另一张
    drive(int(sw * 0.46), 389)              # 点开这张卡片 → 编辑窗
    time.sleep(1.2)
    drive('key', 'escape')                  # 关掉编辑窗
    drive(sw // 2, 3, 'move')               # 鼠标推到屏幕顶端 → 绳子收起
    time.sleep(1.4)
    drive('combo', 'ctrl+alt+q')            # 热键唤出 → 绳子重新放下
    rec.wait(60)
    restore(handles)

    frames = sorted(glob.glob(os.path.join(tmp, 'f-*.png')))
    if not frames:
        raise SystemExit('一帧都没录到，检查 gdigrab 与裁剪参数')
    hit = max(rope_pixels(f) for f in frames[:12])
    print('录到 %d 帧，首帧卡片占比 %.2f' % (len(frames), hit))
    if hit < 0.10:
        print('！开头这些帧看起来没有绳子，确认程序在跑、vault 里有真卡片')

    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-framerate', '12',
                    '-start_number', '1', '-i', os.path.join(tmp, 'f-%03d.png'),
                    '-vf', 'palettegen=max_colors=128:stats_mode=diff', '-y', pal], check=True)
    subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-framerate', '12',
                    '-start_number', '1', '-i', os.path.join(tmp, 'f-%03d.png'), '-i', pal,
                    '-lavfi', 'paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
                    '-y', out], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    print('saved %s  %.2f MB' % (out, os.path.getsize(out) / 1e6))


if __name__ == '__main__':
    main()
