# -*- coding: utf-8 -*-
"""生成托盘图标：一根黄麻绳 + 三个彩色夹子，32x32 透明底。"""

from PIL import Image, ImageDraw

img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 绳子（黄麻色）
d.line([(3, 11), (29, 11)], fill=(201, 168, 94, 255), width=3)

# 三个夹子
for x, c in [(8, (163, 45, 45, 255)), (16, (24, 95, 165, 255)), (24, (133, 79, 11, 255))]:
    d.rectangle([x - 3, 11, x + 3, 23], fill=c)

img.save(r"D:\RailBox\overlay\tray.png")
print("tray.png saved")
