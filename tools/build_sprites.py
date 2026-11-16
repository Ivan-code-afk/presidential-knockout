#!/usr/bin/env python3
"""Нарезка листов GPT (зелёный фон #00FF00) в спрайты игры.

Запуск:  python3 tools/build_sprites.py [папка]   (по умолчанию art/)
Листы лежат в art/<боец>/bush_00.png ... bush_12.png.
Результат: assets/sprites/<боец>/<поза>.png и sprites.js.

Какая фигура какого листа становится какой позой — в таблице MAP ниже.
Номер фигуры считается слева направо, с нуля.
"""
import json, os, sys, glob
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "sprites")

STAND_H = 280       # рост бойца в стойке на экране, пикселей
PORTRAIT = 256      # размер квадратного портрета

# поза: (лист, номер фигуры, тип опоры)
# тип опоры: "feet" — по ступням, "air" — в воздухе (по низу и центру), "lie" — лёжа (по низу и центру),
#            "item" — предмет (по центру)
# REF — по какой фигуре листа считать масштаб и какой рост ей соответствует
COMMON_REF = {
    "01": (0, 1.0), "02": (0, 1.0), "03": (0, 1.0), "04": (1, 1.0), "05": (2, 0.98), "06": (0, 1.0),
    "07": (None, 0.394), "08": (2, 1.08), "09": (2, 1.0), "10": (0, 1.08), "11": (2, 1.1), "12": (1, 1.12),
}
# общие позы: листы 01–07, 10, 11 одинаковы у всех бойцов
BASE = {
    "idle": ("01", 0, "feet"), "crouch": ("01", 1, "feet"), "jump": ("01", 2, "air"),
    "walk_1": ("02", 0, "feet"), "walk_2": ("02", 1, "feet"), "walk_3": ("02", 2, "feet"), "walk_4": ("02", 3, "feet"),
    "punch_0": ("03", 0, "feet"), "punch": ("03", 1, "feet"), "hook": ("03", 2, "feet"),
    "counter": ("04", 0, "feet"), "kick": ("04", 1, "feet"), "akick": ("04", 2, "air"),
    "cpunch": ("05", 0, "feet"), "ckick": ("05", 0, "feet"), "super_0": ("05", 1, "feet"),
    "block": ("06", 0, "feet"), "crouch_block": ("06", 1, "feet"), "hurt": ("06", 2, "feet"),
    "fall": ("07", 0, "air"), "ko": ("07", 1, "lie"), "getup": ("07", 2, "feet"),
    "win": ("10", 0, "feet"), "lose": ("10", 1, "feet"), "portrait": ("10", 2, "portrait"),
    "throw_0": ("11", 0, "feet"), "throw": ("11", 1, "feet"), "thrown": ("11", 2, "feet"),
}
# личные позы (листы 08, 09, 12) и исключения; None — позу не брать
OWN = {
    "bush": {
        "parry": ("08", 0, "feet"), "super": ("08", 1, "air"), "sp_decider_win": ("08", 2, "feet"),
        "item_shoe": ("09", 0, "item"), "item_banner": ("09", 1, "item"), "fatality": ("09", 2, "feet"),
        "sp_brush": ("12", 0, "feet"), "special": ("12", 0, "feet"), "sp_decider": ("12", 1, "feet"),
        "item_brush": ("12", 2, "item"),
    },
    "clinton": {
        # листы 08 и 09 пришли с позами Буша — временно берём что подходит, ждём правильные
        "hook": None,
        "sp_notes": ("10", 0, "feet"), "special": ("10", 0, "feet"),
        "sp_jog": ("12", 0, "feet"), "sp_townhall": ("12", 2, "feet"),
        "super": ("08", 2, "feet"),
    },
}
MAP = {}
for _fid, _own in OWN.items():
    MAP[_fid] = dict(BASE)
    for _k, _v in _own.items():
        if _v is None: MAP[_fid].pop(_k, None)
        else: MAP[_fid][_k] = _v
# если в листе есть особая фигура для масштаба — можно переопределить для бойца
REF_OVERRIDE = {"bush": {"00": (0, 1.08)}, "clinton": {"12": (2, 1.02), "10": (0, 0.93)}}


def mask_of(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (g > 140) & (g - r > 70) & (g - b > 70)
    return ~bg


def components(a):
    fg = ndimage.binary_opening(mask_of(a), iterations=2)
    lab, n = ndimage.label(ndimage.binary_dilation(fg, iterations=6))
    objs = ndimage.find_objects(lab)
    comps = []
    for i, s in enumerate(objs):
        m = (lab[s] == i + 1) & fg[s]
        if m.sum() > 3000:
            comps.append((s[1].start, s, m))
    comps.sort(key=lambda c: c[0])
    return comps


def despill(rgb, alpha):
    rgb = rgb.astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lim = np.maximum(r, b)
    g2 = np.where(g > lim + 10, lim + 10, g)
    rgb[..., 1] = g2
    return rgb.clip(0, 255).astype(np.uint8)


def cut(a, comp, scale):
    _, s, m = comp
    pad = 4
    rgb = a[s][..., :3]
    m = ndimage.binary_erosion(m, iterations=1)
    alpha = (m * 255).astype(np.uint8)
    rgb = despill(rgb, alpha)
    im = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    w, h = im.size
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    arr = np.asarray(im).copy()
    arr[..., 3] = np.where(arr[..., 3] > 110, 255, 0)  # чёткий край без полупрозрачной каймы
    im = Image.fromarray(arr, "RGBA")
    canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad))
    return canvas, pad


def anchor(im, kind, pad):
    a = np.asarray(im)[..., 3] > 0
    ys, xs = np.nonzero(a)
    bottom = ys.max()
    if kind == "feet":
        band = a[max(0, bottom - int(im.height * 0.12)):bottom + 1]
        cols = np.nonzero(band.any(0))[0]
        ax = (cols.min() + cols.max()) / 2
    else:
        ax = (xs.min() + xs.max()) / 2
    return round(float(ax)), int(bottom) + 1


def build(src_dir):
    sprites = {}
    for fid, poses in MAP.items():
        sheets = {}
        for fn in sorted(glob.glob(os.path.join(src_dir, f"{fid}_*.png")) + glob.glob(os.path.join(src_dir, "*", f"{fid}_*.png"))):
            num = os.path.basename(fn)[len(fid) + 1:len(fid) + 3]
            sheets.setdefault(num, fn)  # варианты 03b игнорируем, если нет 03
        if not sheets:
            continue
        os.makedirs(os.path.join(OUT, fid), exist_ok=True)
        cache, scales = {}, {}
        for num, fn in sheets.items():
            a = np.asarray(Image.open(fn).convert("RGB"))
            cache[num] = (a, components(a))
        # масштаб каждого листа: по опорной фигуре или по высоте листа
        for num, (a, comps) in cache.items():
            ref = REF_OVERRIDE.get(fid, {}).get(num) or COMMON_REF.get(num, (None, 0.394))
            idx, k = ref
            if idx is not None and idx < len(comps):
                h = comps[idx][1][0].stop - comps[idx][1][0].start
                scales[num] = STAND_H * k / h
            else:
                scales[num] = (STAND_H / 665) * (a.shape[0] / 724) * (724 / a.shape[0]) if a.shape[0] == 724 else STAND_H / 760
        out = {}
        for pose, (num, idx, kind) in poses.items():
            if num not in cache or idx >= len(cache[num][1]):
                print(f"  ! {fid}: нет листа {num} или фигуры {idx} для позы {pose}")
                continue
            a, comps = cache[num]
            if kind == "portrait":
                _, s, m = comps[idx]
                rgb = despill(a[s][..., :3], None)
                alpha = (ndimage.binary_erosion(m, iterations=1) * 255).astype(np.uint8)
                im = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
                side = max(im.size)
                sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
                sq.paste(im, ((side - im.width) // 2, side - im.height))
                sq = sq.resize((PORTRAIT, PORTRAIT), Image.LANCZOS)
                rel = f"assets/sprites/{fid}/{pose}.png"
                sq.save(os.path.join(ROOT, rel))
                out[pose] = {"src": rel, "ax": 0, "ay": 0}
                continue
            im, pad = cut(a, comps[idx], scales[num])
            ax, ay = anchor(im, kind, pad) if kind != "item" else (im.width // 2, im.height // 2)
            rel = f"assets/sprites/{fid}/{pose}.png"
            im.save(os.path.join(ROOT, rel), optimize=True)
            out[pose] = {"src": rel, "ax": ax, "ay": ay}
        sprites[fid] = out
        print(f"{fid}: {len(out)} поз")
    js = "// Создано tools/build_sprites.py — не править вручную.\n"
    js += "// ax, ay — точка опоры (центр ступней) в пикселях картинки.\n"
    js += "window.SPRITES = " + json.dumps(sprites, indent=1) + ";\n"
    open(os.path.join(ROOT, "sprites.js"), "w").write(js)


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "art"))
