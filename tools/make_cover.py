"""Generates the 1920x1080 Mod Hub cover for the Dutch names mod (needs Pillow)."""
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
out = sys.argv[1] if len(sys.argv) > 1 else "cover.png"
FONT = "/System/Library/Fonts/Helvetica.ttc"
def font(size, bold=False): return ImageFont.truetype(FONT, size, index=1 if bold else 0)

img = Image.new("RGB", (W, H))
px = img.load()
top, bot = (24, 36, 66), (196, 82, 24)
for y in range(H):
    t = (y / H) ** 1.4
    c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    for x in range(W):
        px[x, y] = c
d = ImageDraw.Draw(img, "RGBA")

# soft landscape silhouette: sea, dune, river, hills, factory
d.polygon([(0, H), (0, 800), (300, 760), (620, 820), (960, 740), (1320, 800), (1650, 720), (W, 780), (W, H)], fill=(14, 22, 40, 200))
d.rectangle([0, 900, W, H], fill=(10, 16, 30, 230))
for x, h in [(1500, 140), (1580, 190), (1660, 120)]:
    d.rectangle([x, 760 - h + 60, x + 36, 780], fill=(10, 16, 30, 255))

d.text((120, 150), "Dutch Names", font=font(190, True), fill=(255, 255, 255))
d.text((126, 370), "Town names that fit the landscape", font=font(70), fill=(255, 226, 190))
d.text((126, 470), "Coast  ·  River  ·  Lake  ·  Hills  ·  Industry  ·  Farmland", font=font(44), fill=(255, 255, 255, 210))

chips = [("Zandvoort", 120, 600), ("Zaltbommel", 470, 600), ("Valkenburg", 840, 600), ("Geleen", 1210, 600),
         ("Westkapelle", 120, 700), ("Culemborg", 520, 700), ("Giethoorn", 890, 700), ("Nagele", 1240, 700)]
for text, x, y in chips:
    w = d.textlength(text, font=font(46, True)) + 70
    d.rounded_rectangle([x, y, x + w, y + 80], radius=40, fill=(255, 255, 255, 235))
    d.text((x + 35, y + 14), text, font=font(46, True), fill=(30, 40, 70))

d.text((120, 960), "Streets and residents  ·  made with Names Studio", font=font(40), fill=(255, 255, 255, 190))
img.save(out)
print("wrote", out)
