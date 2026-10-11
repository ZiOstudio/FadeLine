# -*- coding: utf-8 -*-
"""生成 README 用的头图：截屏 → 裁到绳子区域 → 缩小。

用法：先开启 config.json 的 demoMode 并重启程序让绳子挂满，然后
      python dev/make_readme_art.py

这个脚本要处理两件容易被忽略的事，否则截出来的永远是桌面：

  1) 鼠标必须停在【绳子范围之外】。停在某根绳附近会触发「悬停聚焦」，
     另外两根绳的卡片会被降到 45% 透明度，截出来是一张花掉的图。
     而且必须用 SendInput 走完整输入栈来移动 —— SetCursorPos 不会产生
     Electron 的 forward:true 会转发的那种 WM_MOUSEMOVE，
     悬停聚焦的状态会停在上一次真实鼠标移动的位置，你以为挪开了其实没挪。

  2) 程序启动那一刻如果鼠标恰好在屏幕顶端，顶边触发会把绳子收起来。
     所以抓不到时会用 Ctrl+Alt+Q 兜底唤出一次。
"""
import os
import subprocess
import sys
import time

from PIL import Image, ImageGrab

HERE = os.path.dirname(os.path.abspath(__file__))
CLICK = os.path.join(HERE, 'click_at.py')
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'docs', 'hero.png'))

# 绳子主色 #C9A85E，以及它被压缩/抗锯齿之后的近邻色
ROPE_MIN = (180, 145, 55)
ROPE_MAX = (228, 198, 138)


def looks_like_rope(img):
    """在整图上稀疏采样，数绳子那圈金色有多少个点。

    注意两件事：
      - 不能用缩略图：绳子只有 4.6px 宽，缩小后会被背景混掉认不出来。
      - 不能"找到 1 个点就算"：桌面图标里也有黄色，会误判。
        绳子很长（3 根 × 2560px），稀疏采样下命中数应该是三位数，
        所以要求至少 40 个点。
    """
    px = img.load()
    w, h = img.size
    hits = 0
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            r, g, b = px[x, y][:3]
            if (ROPE_MIN[0] <= r <= ROPE_MAX[0]
                    and ROPE_MIN[1] <= g <= ROPE_MAX[1]
                    and ROPE_MIN[2] <= b <= ROPE_MAX[2]):
                hits += 1
                if hits >= 40:
                    return True
    return False


def run(*args):
    try:
        return subprocess.run([sys.executable, CLICK] + list(args),
                              capture_output=True, timeout=20)
    except Exception as e:
        print('（调用 click_at.py 失败：%s）' % e)
        return None


# 把鼠标挪到绳子上方（y≈130，绳子占 181..1137），两个触发都躲开。
# 抓图窗口要短 —— 如果你正在用这台电脑，鼠标随时可能被挪到屏幕顶端
# （触发顶边收起）或挪到某根绳上（触发悬停聚焦），那两样都会毁掉这张图。
run('1280', '130', 'move')
time.sleep(0.5)

shot = None
for attempt in range(6):
    img = ImageGrab.grab()
    if looks_like_rope(img):
        shot = img
        break
    if attempt == 2:
        print('还没看到绳子，用 Ctrl+Alt+Q 唤出一次…')
        run('combo', 'ctrl+alt+q')
    time.sleep(1.0)

if shot is None:
    raise SystemExit('没抓到绳子。确认程序在运行、演示模式已开启、'
                     '而且你暂时没在用鼠标（鼠标停屏幕顶端会触发收起）。')

w, h = shot.size
k = w / 2560.0                     # 截图拿到的是物理分辨率，按 2560 逻辑宽换算
# 只裁绳子真正占用的那一段（逻辑 y ≈ 160..1100）：
#   上边界 160 —— 第一根绳在 181，留一点余量
#   下边界 1100 —— 第三根绳的卡片底部在约 1081，再往下是空的
# 这样能把桌面图标和任务栏挤出去，构图干净些。
shot = shot.crop((0, int(160 * k), w, min(h, int(1100 * k))))

target_w = 1600
shot = shot.resize((target_w, int(shot.size[1] * target_w / shot.size[0])), Image.LANCZOS)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
shot.save(OUT)
print('saved %s  %dx%d' % (OUT, shot.size[0], shot.size[1]))
