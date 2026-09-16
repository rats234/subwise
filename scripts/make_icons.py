"""Generate SubWise PWA icons: a cream rounded-square background with the
◆ diamond mark in the app's accent green, matching public/styles.css.
Run once; output lands in public/icons/.
"""
import os
from PIL import Image, ImageDraw

BG = (246, 244, 239, 255)      # --bg
ACCENT = (47, 93, 80, 255)     # --accent

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)


def make_icon(size, maskable=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded-square background. For "maskable" icons keep more padding so
    # OS masks (circle, squircle, etc.) don't clip the diamond.
    pad = size * (0.18 if maskable else 0.06)
    radius = size * 0.22
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=BG)

    # Diamond mark, centered, sized relative to the safe area.
    safe = size - 2 * pad
    cx, cy = size / 2, size / 2
    half = safe * 0.28
    points = [(cx, cy - half), (cx + half, cy), (cx, cy + half), (cx - half, cy)]
    draw.polygon(points, fill=ACCENT)

    return img


for size in (192, 512):
    make_icon(size).save(os.path.join(OUT_DIR, f"icon-{size}.png"))
    make_icon(size, maskable=True).save(os.path.join(OUT_DIR, f"icon-{size}-maskable.png"))

# A simple favicon too, reusing the 192 render.
make_icon(64).save(os.path.join(OUT_DIR, "favicon-64.png"))

print("done:", os.listdir(OUT_DIR))
