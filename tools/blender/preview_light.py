"""Side-by-side check of the light map: the scan as photographed, then relit.

Run:  blender -b --python tools/blender/preview_light.py -- <work_dir> <out.png>
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lighting  # noqa: E402
import scan_scene  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
work_dir, out_path = os.path.abspath(args[0]), os.path.abspath(args[1])

base = scan_scene.load_png(os.path.join(work_dir, "base_albedo.png"))
height, width = base.shape[:2]
light = lighting.light_map(work_dir, height, width)
lit = lighting.relight(base.copy(), light)
shade = np.dstack([np.clip(light / lighting.CEILING, 0, 1)] * 3 + [base[:, :, 3]])

# Halve the size so the three panels stay easy to open.
sheet = np.concatenate([base, lit, shade], axis=1)[::2, ::2]
scan_scene.save_png(out_path, sheet)
print("WROTE", out_path, sheet.shape[1], "x", sheet.shape[0])
