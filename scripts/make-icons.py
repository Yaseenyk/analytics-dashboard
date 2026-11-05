"""Draw the dashboard logo (same design as public/icon.svg) as PNGs and the favicon.
   python scripts/make-icons.py   -> public/icon-192.png, icon-512.png, apple-touch-icon.png, favicon.ico
Drawn with Pillow at 4x and downsampled, so edges are smooth. No image API."""
from PIL import Image, ImageDraw, ImageFilter

TILE = (14, 20, 28, 255)        # #0E141C
VIOLET = (168, 85, 247)
CYAN = (34, 211, 238)
PTS = [(6, 21.5), (11.5, 15.5), (15, 19), (20, 9.5), (23.5, 13), (26, 10)]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw(size):
    ss = 4
    S = size * ss
    k = S / 32.0
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=9 * k, fill=TILE)
    d.rounded_rectangle((0.5 * k, 0.5 * k, S - 1 - 0.5 * k, S - 1 - 0.5 * k), radius=8.5 * k, outline=(255, 255, 255, 20), width=max(1, round(1 * k)))

    # area under the line: cyan fading to nothing
    area = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ad = ImageDraw.Draw(area)
    poly = [(x * k, y * k) for x, y in PTS] + [(26 * k, 25.5 * k), (6 * k, 25.5 * k)]
    ad.polygon(poly, fill=CYAN + (72,))
    mask = Image.linear_gradient("L").resize((S, S)).transpose(Image.FLIP_TOP_BOTTOM)  # bright at top
    top, bottom = 9.5 * k, 25.5 * k
    mask = mask.point(lambda v: v)  # keep as is
    grad = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(grad)
    for y in range(int(top), int(bottom) + 1):
        t = (y - top) / (bottom - top)
        gd.line([(0, y), (S, y)], fill=int(255 * (1 - t)))
    area.putalpha(Image.eval(area.split()[3], lambda v: v).point(lambda v: v))
    a = area.split()[3]
    area.putalpha(Image.composite(a, Image.new("L", (S, S), 0), grad).point(lambda v: v))
    img.alpha_composite(area)

    # the line, colour sliding violet -> cyan left to right
    line = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(line)
    w = 2.4 * k
    x0, x1 = PTS[0][0], PTS[-1][0]
    steps = 48
    for (ax, ay), (bx, by) in zip(PTS, PTS[1:]):
        for i in range(steps):
            t0, t1 = i / steps, (i + 1) / steps
            p = (ax + (bx - ax) * t0, ay + (by - ay) * t0)
            q = (ax + (bx - ax) * t1, ay + (by - ay) * t1)
            c = lerp(VIOLET, CYAN, ((p[0] + q[0]) / 2 - x0) / (x1 - x0))
            ld.line([(p[0] * k, p[1] * k), (q[0] * k, q[1] * k)], fill=c + (255,), width=round(w))
    for x, y in PTS:
        c = lerp(VIOLET, CYAN, (x - x0) / (x1 - x0))
        r = w / 2
        ld.ellipse((x * k - r, y * k - r, x * k + r, y * k + r), fill=c + (255,))
    img.alpha_composite(line)

    # end dot with a soft glow
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd2 = ImageDraw.Draw(glow)
    cx, cy = 26 * k, 10 * k
    gd2.ellipse((cx - 4.4 * k, cy - 4.4 * k, cx + 4.4 * k, cy + 4.4 * k), fill=CYAN + (56,))
    glow = glow.filter(ImageFilter.GaussianBlur(0.6 * k))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    d.ellipse((cx - 2.2 * k, cy - 2.2 * k, cx + 2.2 * k, cy + 2.2 * k), fill=CYAN + (255,))

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
        draw(size).save(f"public/{name}", optimize=True)
        print("wrote", name)
    base = draw(64)
    base.save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote favicon.ico")
