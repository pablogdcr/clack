"""Build a top-down height map of the scan and save it for the other steps.

Run:  blender -b --python tools/blender/build_heightmap.py -- <model.glb> <out_dir> [--px-per-m 2000]
Writes: heightmap.npy (metres, NaN = empty), heightmap.png (grey preview), frame.json
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scan_scene  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
model_path, out_dir = args[0], args[1]
px_per_m = float(args[args.index("--px-per-m") + 1]) if "--px-per-m" in args else 2000.0
os.makedirs(out_dir, exist_ok=True)

obj = scan_scene.load_model(model_path)
frame = scan_scene.model_frame(obj)
heights = scan_scene.heightmap(obj, frame, px_per_m)

np.save(os.path.join(out_dir, "heightmap.npy"), heights)
with open(os.path.join(out_dir, "frame.json"), "w") as handle:
    json.dump({**frame.__dict__, "heightmap_px_per_m": px_per_m}, handle, indent=2)

filled = np.isfinite(heights)
grey = np.where(filled, (heights - frame.z0) / (frame.z1 - frame.z0), 0.0)
preview = np.dstack([grey, grey, grey, filled.astype(np.float32)])
scan_scene.save_png(os.path.join(out_dir, "heightmap.png"), preview)

print("HEIGHTMAP", heights.shape, "covered", round(float(filled.mean()), 3))
print("FRAME", frame)
# Height profile of the keyboard half, to see the row tiers.
rows = heights.shape[0]
for r in range(rows // 2, rows, 20):
    line = heights[r]
    ok = np.isfinite(line)
    if ok.any():
        print(f"row {r:4d} y={frame.y1 - (r + 0.5) / px_per_m:+.3f}  max={np.nanmax(line):.3f}  p90={np.nanpercentile(line, 90):.3f}  cover={ok.mean():.2f}")
