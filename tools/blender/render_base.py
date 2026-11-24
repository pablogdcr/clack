"""Render the two aligned base images every later step works from.

Run:  blender -b --python tools/blender/render_base.py -- <model.glb> <out_dir> [--px-per-m 6000]
Writes: base_albedo.png (the scan's colours), base_height.png (16-bit), height.npy (metres), frame.json
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scan_scene  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
model_path, out_dir = args[0], args[1]
px_per_m = float(args[args.index("--px-per-m") + 1]) if "--px-per-m" in args else 6000.0
os.makedirs(out_dir, exist_ok=True)

obj = scan_scene.load_model(model_path)
frame = scan_scene.model_frame(obj)
scan_scene.setup_top_camera(frame, px_per_m)

scan_scene.use_albedo_materials()
scan_scene.render_to(os.path.join(out_dir, "base_albedo.png"))

scan_scene.use_height_materials(frame)
height_png = os.path.join(out_dir, "base_height.png")
scan_scene.render_to(height_png)

pixels = scan_scene.load_png(height_png, data=True)
covered = pixels[:, :, 3] > 0.5
heights = np.where(covered, frame.z0 + pixels[:, :, 0] * (frame.z1 - frame.z0), np.nan).astype(np.float32)
np.save(os.path.join(out_dir, "height.npy"), heights)

width, height = frame.size_px(px_per_m)
with open(os.path.join(out_dir, "frame.json"), "w") as handle:
    json.dump({**frame.__dict__, "px_per_m": px_per_m, "width_px": width, "height_px": height}, handle, indent=2)

print("BASE", heights.shape, "covered", round(float(covered.mean()), 3),
      "z range", round(float(np.nanmin(heights)), 4), round(float(np.nanmax(heights)), 4),
      "expected", round(frame.z0, 4), round(frame.z1, 4))
