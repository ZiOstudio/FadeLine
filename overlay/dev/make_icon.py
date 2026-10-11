# -*- coding: utf-8 -*-
"""生成两个图标（两者设计不同，因为用途不同）：

    tray.png   32x32 透明底  托盘用。16~32px 下画不了细节，所以只保留
                             「一根绳 + 三个夹子」这个最简识别形。
    icon.ico   多尺寸        程序图标。有底、有纸片，用得上细节。

纸片的颜色就是界面里卡片随时间褪色的那套渐变（浅黄 → 琥珀）。

用法：python dev/make_icon.py
"""

import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..'))

ROPE = (201, 168, 94, 255)
CLIPS = [(163, 45, 45, 255), (24, 95, 165, 255), (133, 79, 11, 255)]

BG = (252, 248, 235, 255)          # 比纸片浅一档，否则第一张纸片会隐身
BG_EDGE = (230, 220, 194, 255)
PAPER = [(246, 234, 196, 255), (229, 203, 147, 255), (204, 170, 110, 255)]
PAPER_EDGE = (198, 176, 134, 255)


def draw_tray():
    """托盘：保持最初那版简洁设计（透明底、绳 + 三夹）。"""
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line([(3, 11), (29, 11)], fill=ROPE, width=3)
    for x, c in zip((8, 16, 24), CLIPS):
        d.rectangle([x - 3, 11, x + 3, 23], fill=c)
    return img


def rope_y(x, x0, x1):
    """二次贝塞尔：两端 y=92、中点下垂。和界面里的绳形一致。"""
    t = (x - x0) / float(x1 - x0)
    return (1 - t) ** 2 * 92.0 + 2 * (1 - t) * t * (92.0 + 48.0) + t ** 2 * 92.0


def draw_app(size=256):
    k = size / 256.0
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def box(x0, y0, x1, y1, r, fill, outline=None, w=0):
        d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], radius=r * k,
                            fill=fill, outline=outline,
                            width=max(1, round(w * k)) if w else 0)

    # 底
    box(14, 14, 242, 242, 52, BG, BG_EDGE, 3)

    # 绳
    x0, x1 = 36, 220
    pts = [(x, rope_y(x, x0, x1)) for x in range(x0, x1 + 1)]
    d.line([(x * k, y * k) for x, y in pts], fill=ROPE,
           width=max(1, round(9 * k)), joint='curve')

    # 三张纸片（从浅到深）+ 夹子
    cw, ch = 48, 62
    for i, cx in enumerate([70, 128, 186]):
        y = rope_y(cx, x0, x1)
        box(cx - cw / 2, y + 2, cx + cw / 2, y + 2 + ch, 9, PAPER[i], PAPER_EDGE, 2)
        box(cx - 7, y - 26, cx + 7, y + 10, 5, CLIPS[i])
    return img


big = draw_app(256)
draw_tray().save(os.path.join(OUT, 'tray.png'))
big.save(os.path.join(OUT, 'icon.png'))
big.save(os.path.join(OUT, 'icon.ico'),
         sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('已生成 tray.png / icon.png / icon.ico')
