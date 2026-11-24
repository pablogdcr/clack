"""What the scan cannot supply for the print point, drawn at 3 px per screen point: the stretch
of ribbon the type strikes (the scan's ribbon is wound on its spools), and soft shadows.

Every function returns a straight-alpha RGBA array (rows top to bottom).
"""
import numpy as np

PT = 3

# Ribbon: the stretch of two-colour cloth seen from the front at the print point. On the
# machine two wire hooks hold it there; they are too fine for the scan to show.
RIBBON_CLOTH_WIDTH_PT = 26
RIBBON_CLOTH_TOP_PT = 1.5
RIBBON_CLOTH_HEIGHT_PT = 15
RIBBON_BLACK_HEIGHT_PT = 7.5
# How far down the cloth the type strikes when red is selected: the middle of the red half.
RIBBON_RED_STRIKE_PT = 11.25
RIBBON_PAD_PT = 1.5


def _grid(width_pt, height_pt):
    """Pixel-centre coordinates in points: x from the middle, y from the top."""
    width, height = int(round(width_pt * PT)), int(round(height_pt * PT))
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    return (xx + 0.5) / PT - width_pt / 2, (yy + 0.5) / PT


def _cover(distance_pt):
    """Share of a pixel inside a shape, from its signed distance to the edge (negative inside)."""
    return np.clip(0.5 - distance_pt * PT, 0, 1)


def _blur(image, sigma_px):
    reach = max(1, int(round(sigma_px * 3)))
    taps = np.exp(-0.5 * (np.arange(-reach, reach + 1) / sigma_px) ** 2)
    taps /= taps.sum()
    out = image
    for axis in (0, 1):
        padded = np.pad(out, [(reach, reach) if a == axis else (0, 0) for a in range(out.ndim)])
        out = sum(weight * padded.take(range(offset, offset + image.shape[axis]), axis=axis)
                  for offset, weight in enumerate(taps))
    return out


def shadow_of(part, pad_px, sigma_pt=1.5, strength=0.5):
    """The soft shadow a part casts: its outline, blurred and black, on a canvas wider by pad_px
    on each side so that the blur is not cut."""
    alpha = np.pad(part[:, :, 3], ((0, 0), (pad_px, pad_px)))
    alpha = _blur(alpha, sigma_pt * PT) * strength
    return np.dstack([np.zeros(alpha.shape + (3,), dtype=np.float32), alpha]).astype(np.float32)


def ribbon():
    """The stretch of black-and-red ribbon the type strikes through, seen from the front."""
    rng = np.random.default_rng(23)
    width_pt = RIBBON_CLOTH_WIDTH_PT + 2 * RIBBON_PAD_PT
    height_pt = RIBBON_CLOTH_HEIGHT_PT + 2
    x, y = _grid(width_pt, height_pt)
    cloth_y = y - RIBBON_CLOTH_TOP_PT
    cloth_half = RIBBON_CLOTH_WIDTH_PT / 2

    # Cloth: black on top, red below, both dulled by use.
    black = np.array([0.075, 0.07, 0.085], dtype=np.float32)
    red = np.array([0.43, 0.075, 0.06], dtype=np.float32)
    to_red = np.clip((cloth_y - RIBBON_BLACK_HEIGHT_PT) / 0.5 + 0.5, 0, 1)[..., None]
    colour = black * (1 - to_red) + red * to_red
    # Woven threads, a slow unevenness, and the ends falling away from the light.
    weave = 1 + 0.2 * np.sin(2 * np.pi * x / 1.34) * np.sin(2 * np.pi * cloth_y / 1.34)
    uneven = 1 + 0.18 * _blur(rng.uniform(-1, 1, x.shape).astype(np.float32), 4)
    from_end = np.clip((cloth_half - np.abs(x)) / 4.5, 0, 1)
    turn = 0.78 + 0.22 * from_end ** 0.7
    grain = 1 + 0.1 * rng.uniform(-1, 1, x.shape).astype(np.float32)
    colour = colour * (weave * uneven * turn * grain)[..., None]
    # Where the type has been hitting, the ink is beaten out: a paler, blotchy track.
    track = np.exp(-((cloth_y - RIBBON_BLACK_HEIGHT_PT / 2) / 1.9) ** 2)
    blotches = np.clip(_blur(rng.uniform(0, 1, x.shape).astype(np.float32), 2.2) * 3.2 - 1.1, 0, 1)
    colour = colour + (0.1 * track * blotches * from_end)[..., None] * np.array([1.0, 0.95, 1.05], dtype=np.float32)
    # Top edge: a slightly ragged selvedge, a shade darker. The bottom is never seen.
    ragged = 0.22 * _blur(rng.uniform(-1, 1, x.shape).astype(np.float32), 1.6) * 3
    edge = np.maximum(-cloth_y + ragged, cloth_y - RIBBON_CLOTH_HEIGHT_PT)
    colour = colour * (1 - 0.35 * np.clip(1 + (-cloth_y + ragged) / 0.8, 0, 1))[..., None]
    alpha = _cover(edge) * np.clip((cloth_half - np.abs(x)) / 0.7, 0, 1)
    return np.dstack([np.clip(colour, 0, 1), alpha]).astype(np.float32)
