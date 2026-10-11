# -*- coding: utf-8 -*-
"""截屏保存，用于验证"系统对话框有没有被置顶浮层盖住"这类视觉问题。
用法：python screenshot.py <输出路径> [缩放分母]
"""
import sys

from PIL import ImageGrab

out = sys.argv[1] if len(sys.argv) > 1 else 'shot.png'
div = int(sys.argv[2]) if len(sys.argv) > 2 else 1

img = ImageGrab.grab()
w, h = img.size
if div > 1:
    img = img.resize((w // div, h // div))
img.save(out)
print('saved %s  %dx%d' % (out, img.size[0], img.size[1]))
