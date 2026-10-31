# 生成像素风福袋图标：python scripts/gen-icon.py
# 需要 Pillow。输出 build/icon.png（512）与 build/icon.ico。
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
os.makedirs(BUILD, exist_ok=True)

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 背景圆角底
d.rounded_rectangle([16, 16, S - 16, S - 16], radius=96, fill=(20, 13, 24, 255))
d.rounded_rectangle([28, 28, S - 28, S - 28], radius=84, fill=(86, 11, 23, 255))

# 福袋主体
body = [120, 176, 392, 448]
d.rounded_rectangle(body, radius=44, fill=(215, 43, 63, 255), outline=(20, 13, 24, 255), width=12)
d.rounded_rectangle([132, 188, 380, 436], radius=34, fill=(255, 80, 96, 255))
d.rounded_rectangle([144, 200, 368, 424], radius=26, fill=(215, 43, 63, 255))

# 袋口束带
d.polygon([(170, 176), (342, 176), (326, 208), (186, 208)], fill=(199, 138, 36, 255))
d.rectangle([196, 150, 316, 178], fill=(255, 208, 90, 255))
d.rectangle([196, 150, 316, 160], fill=(255, 239, 168, 255))
d.rectangle([150, 330, 362, 352], fill=(199, 138, 36, 255))
d.rectangle([150, 330, 362, 338], fill=(255, 208, 90, 255))

# 金边装饰
d.rectangle([120, 292, 392, 306], fill=(255, 208, 90, 255))
d.rectangle([132, 414, 380, 424], fill=(199, 138, 36, 255))

# 福字
font = None
for candidate in (
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simsun.ttc",
):
    if os.path.exists(candidate):
        try:
            font = ImageFont.truetype(candidate, 176)
            break
        except Exception:
            font = None

if font is not None:
    text = "福"
    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    tx = (S - tw) / 2 - box[0]
    ty = 250 - th / 2 - box[1]
    # 描边
    for ox, oy in [(-6, 0), (6, 0), (0, -6), (0, 6)]:
        d.text((tx + ox, ty + oy), text, font=font, fill=(86, 11, 23, 255))
    d.text((tx, ty), text, font=font, fill=(255, 208, 90, 255))
else:
    d.rectangle([216, 250, 296, 330], fill=(255, 208, 90, 255))
    d.rectangle([232, 266, 280, 314], fill=(215, 43, 63, 255))

# 高光
d.rectangle([150, 200, 164, 300], fill=(255, 239, 168, 160))
d.rectangle([168, 200, 176, 240], fill=(255, 239, 168, 120))

png_path = os.path.join(BUILD, "icon.png")
img.save(png_path)

ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(os.path.join(BUILD, "icon.ico"), sizes=ico_sizes)
print("wrote", png_path)
print("wrote", os.path.join(BUILD, "icon.ico"))
