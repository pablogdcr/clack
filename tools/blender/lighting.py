"""Turn the two shading passes from render_shade.py into one light map for the scan's colours.

The scan's texture already holds the flat light it was photographed under, so the map is a
gentle correction, not a full relight: 1 where a surface is open to the lamp, lower in
crevices and shadows, a little above 1 where the lamp hits a surface squarely.
"""
import os

import numpy as np

import scan_scene

# Share of the light that comes from the lamp; the rest comes from the whole sky.
KEY_SHARE = 0.55
# How dark a fully hidden crevice may get, as a share of the open-surface brightness.
FLOOR = 0.22
# Above 1 the shadows deepen, below 1 they soften.
CONTRAST = 1.15
# Brightest a surface facing the lamp may get.
CEILING = 1.18


def _upscale(image, height, width):
    """Bilinear resize of a 2D array to height x width."""
    src_h, src_w = image.shape
    ys = np.clip((np.arange(height, dtype=np.float32) + 0.5) * src_h / height - 0.5, 0, src_h - 1)
    xs = np.clip((np.arange(width, dtype=np.float32) + 0.5) * src_w / width - 0.5, 0, src_w - 1)
    y0 = np.floor(ys).astype(np.int32)
    x0 = np.floor(xs).astype(np.int32)
    y1 = np.minimum(y0 + 1, src_h - 1)
    x1 = np.minimum(x0 + 1, src_w - 1)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    top = image[y0][:, x0] * (1 - fx) + image[y0][:, x1] * fx
    bottom = image[y1][:, x0] * (1 - fx) + image[y1][:, x1] * fx
    return top * (1 - fy) + bottom * fy


def _normalised(path):
    """One pass as a 2D array where 1 is a flat surface open to the light."""
    image = scan_scene.load_png(path, data=True)
    value = image[:, :, 0]
    covered = image[:, :, 3] > 0.5
    return value / np.percentile(value[covered], 90)


def light_map(work_dir, height, width, key_share=KEY_SHARE):
    """Multiplier for the colours of the base frame, height x width. Ones if no passes exist.

    key_share=0 keeps only the sky light, which has no direction: use it for parts that turn.
    """
    sky_path = os.path.join(work_dir, "shade_sky.png")
    key_path = os.path.join(work_dir, "shade_key.png")
    if not (os.path.exists(sky_path) and os.path.exists(key_path)):
        print("NO SHADE PASSES in", work_dir, "- colours left as scanned")
        return np.ones((height, width), dtype=np.float32)
    light = (1 - key_share) * _normalised(sky_path) + key_share * _normalised(key_path)
    light = np.clip(light, 0, None) ** CONTRAST
    light = FLOOR + (1 - FLOOR) * light
    light = np.clip(light, FLOOR, CEILING)
    return _upscale(light, height, width).astype(np.float32)


def relight(image, light):
    """Apply a light map (or the matching crop of one) to an RGBA image, in place."""
    image[:, :, :3] = np.clip(image[:, :, :3] * light[:, :, None], 0, 1)
    return image
