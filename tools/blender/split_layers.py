"""Split the scan into layers and render each one from the same top-down camera.

Run:  blender -b --python tools/blender/split_layers.py -- <model.glb> <work_dir>
Reads:  frame.json, keys.json, base_albedo.png
Writes: layers/body.png, layers/carriage.png, layers/keys.png, layers/recombined.png,
        sprites/<key id>.png, layers.json

Layers
  keys      every key cap and its ring (the stems stay on the body)
  carriage  the part that slides: paper table, platen, side arms, knobs, return lever
  body      everything else, with the keys and carriage removed
"""
import json
import os
import sys

import bmesh
import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scan_scene  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
model_path, work_dir = args[0], args[1]
with open(os.path.join(work_dir, "frame.json")) as handle:
    frame_data = json.load(handle)
with open(os.path.join(work_dir, "keys.json")) as handle:
    keys = json.load(handle)
px_per_m = frame_data["px_per_m"]
frame = scan_scene.Frame(*(frame_data[k] for k in ("x0", "x1", "y0", "y1", "z0", "z1")))

# A key cap, ring and cup are about 9 mm deep; below that it is stem.
KEY_DEPTH_M = 0.009
KEY_MARGIN_M = 0.0012

# The carriage, as seen from above (world metres). Read off the height render.
CARRIAGE_FRONT_Y = -0.0386                                   # front edge of the platen block
CARRIAGE_LEFT_ARM = dict(x_max=0.1577, y_min=-0.1100)        # left side arm and return lever
CARRIAGE_RIGHT_ARM = dict(x_min=0.4211, y_min=-0.0886)       # right side arm and knob

obj = scan_scene.load_model(model_path)
mesh = obj.data
centres = np.empty(len(mesh.polygons) * 3, dtype=np.float32)
mesh.polygons.foreach_get("center", centres)
centres = centres.reshape(-1, 3)
cx, cy, cz = centres[:, 0], centres[:, 1], centres[:, 2]

# A key whose top sits far above its row is hidden under something else (here, a lever knob
# 34 mm up). The backspace key is legitimately 13 mm taller than its neighbours, so allow that.
for row in sorted({k["row"] for k in keys}):
    members = [k for k in keys if k["row"] == row]
    row_top = float(np.median([k["top_z"] for k in members]))
    for key in members:
        key["obstructed"] = bool(key["top_z"] > row_top + 0.020)
usable_keys = [k for k in keys if not k["obstructed"]]
print("OBSTRUCTED", [k["id"] for k in keys if k["obstructed"]])

is_key = np.zeros(len(centres), dtype=bool)
for key in usable_keys:
    near = np.hypot(cx - key["x"], cy - key["y"]) < key["radius"] + KEY_MARGIN_M
    is_key |= near & (cz > key["top_z"] - KEY_DEPTH_M)

# The space bar: a long flat bar at the front, its top 45 mm up. It moves like a key,
# so it goes on the keys layer.
SPACE_BAR = dict(x_min=0.1793, x_max=0.4018, y_min=-0.2372, y_max=-0.2206, z_min=0.034)
is_space_bar = (
    (cx > SPACE_BAR["x_min"]) & (cx < SPACE_BAR["x_max"])
    & (cy > SPACE_BAR["y_min"]) & (cy < SPACE_BAR["y_max"]) & (cz > SPACE_BAR["z_min"])
)
is_key |= is_space_bar

# Close to a cut line the body passes underneath the carriage, so only the high surfaces
# (platen, arms, lever) are carriage there; the lower ones stay with the body.
between_arms = (cx > CARRIAGE_LEFT_ARM["x_max"]) & (cx < CARRIAGE_RIGHT_ARM["x_min"])
near_front = (cy < CARRIAGE_FRONT_Y + 0.025) & between_arms
rear_block = (cy > CARRIAGE_FRONT_Y) & (~near_front | (cz > 0.176))
left_arm = (cx < CARRIAGE_LEFT_ARM["x_max"]) & (cy > CARRIAGE_LEFT_ARM["y_min"]) & (cy <= CARRIAGE_FRONT_Y) & (cz > 0.18)
right_arm = (cx > CARRIAGE_RIGHT_ARM["x_min"]) & (cy > CARRIAGE_RIGHT_ARM["y_min"]) & (cy <= CARRIAGE_FRONT_Y) & (cz > 0.18)
is_carriage = (rear_block | left_arm | right_arm) & ~is_key
is_body = ~is_key & ~is_carriage
print("FACES keys", int(is_key.sum()), "carriage", int(is_carriage.sum()), "body", int(is_body.sum()))


def make_layer(name, keep):
    layer_mesh = mesh.copy()
    bm = bmesh.new()
    bm.from_mesh(layer_mesh)
    bm.faces.ensure_lookup_table()
    doomed = [bm.faces[i] for i in np.nonzero(~keep)[0]]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(layer_mesh)
    bm.free()
    layer = bpy.data.objects.new(name, layer_mesh)
    bpy.context.scene.collection.objects.link(layer)
    return layer


layers = {
    "body": make_layer("Body", is_body),
    "carriage": make_layer("Carriage", is_carriage),
    "keys": make_layer("Keys", is_key),
}
obj.hide_render = True

scan_scene.setup_top_camera(frame, px_per_m)
scan_scene.use_albedo_materials()
layer_dir = os.path.join(work_dir, "layers")
sprite_dir = os.path.join(work_dir, "sprites")
os.makedirs(layer_dir, exist_ok=True)
os.makedirs(sprite_dir, exist_ok=True)

images = {}
for name, layer in layers.items():
    for other in layers.values():
        other.hide_render = other is not layer
    path = os.path.join(layer_dir, f"{name}.png")
    scan_scene.render_to(path)
    images[name] = scan_scene.load_png(path)


def over(top, bottom):
    """Alpha-composite two straight-alpha images."""
    top_a, bottom_a = top[:, :, 3:4], bottom[:, :, 3:4]
    out_a = top_a + bottom_a * (1 - top_a)
    rgb = (top[:, :, :3] * top_a + bottom[:, :, :3] * bottom_a * (1 - top_a)) / np.maximum(out_a, 1e-6)
    return np.dstack([rgb, out_a])


# Check: stacking the layers back must give the original render.
recombined = over(images["keys"], over(images["carriage"], images["body"]))
scan_scene.save_png(os.path.join(layer_dir, "recombined.png"), recombined)
base = scan_scene.load_png(os.path.join(work_dir, "base_albedo.png"))
difference = np.abs(recombined - base).max(axis=2)
print("RECOMBINE mean diff", round(float(difference.mean()), 5),
      "pixels off by more than 8/255:", round(float((difference > 8 / 255).mean()) * 100, 3), "%")

# One sprite per key, cut from the keys layer.
keys_image = images["keys"]
height_px, width_px = keys_image.shape[:2]
cell = (int(round(max(k["radius_px"] for k in usable_keys) + 8)) + 2) * 2
columns = max(sum(1 for k in usable_keys if k["row"] == row) for row in {k["row"] for k in usable_keys})
row_count = len({k["row"] for k in usable_keys})
sheet = np.zeros((row_count * cell, columns * cell, 4), dtype=np.float32)
sheet[:, :, :3] = 0.42
sheet[:, :, 3] = 1.0
slot = {}
for key in usable_keys:
    half = int(round(key["radius_px"] + 8))
    left = max(0, int(round(key["px"])) - half)
    top = max(0, int(round(key["py"])) - half)
    right = min(width_px, left + 2 * half)
    bottom = min(height_px, top + 2 * half)
    sprite = keys_image[top:bottom, left:right].copy()
    # The crop box is wider than the gap to the next key, so mask to this key's own circle.
    yy, xx = np.mgrid[top:bottom, left:right]
    distance = np.hypot(xx + 0.5 - key["px"], yy + 0.5 - key["py"])
    sprite[:, :, 3] *= np.clip((key["radius_px"] + 5 - distance) / 1.5, 0.0, 1.0)
    scan_scene.save_png(os.path.join(sprite_dir, f"{key['id']}.png"), sprite)
    key["sprite"] = dict(file=f"sprites/{key['id']}.png", left=left, top=top, width=right - left, height=bottom - top)
    # Contact sheet: one row per keyboard row, on mid grey so the cut-out edges are visible.
    column = slot.get(key["row"], 0)
    slot[key["row"]] = column + 1
    oy = key["row"] * cell + (cell - sprite.shape[0]) // 2
    ox = column * cell + (cell - sprite.shape[1]) // 2
    region = sheet[oy:oy + sprite.shape[0], ox:ox + sprite.shape[1]]
    region[:, :, :3] = sprite[:, :, :3] * sprite[:, :, 3:4] + region[:, :, :3] * (1 - sprite[:, :, 3:4])
scan_scene.save_png(os.path.join(work_dir, "sprites_sheet.png"), sheet)

# The space bar sprite: whatever the keys layer holds inside the bar's box.
bar_left = int((SPACE_BAR["x_min"] - frame.x0) * px_per_m) - 6
bar_right = int((SPACE_BAR["x_max"] - frame.x0) * px_per_m) + 6
bar_top = int((frame.y1 - SPACE_BAR["y_max"]) * px_per_m) - 6
bar_bottom = int((frame.y1 - SPACE_BAR["y_min"]) * px_per_m) + 6
bar = keys_image[bar_top:bar_bottom, bar_left:bar_right]
solid_rows = np.nonzero(bar[:, :, 3].max(axis=1) > 0.5)[0]
solid_cols = np.nonzero(bar[:, :, 3].max(axis=0) > 0.5)[0]
bar_top, bar_bottom = bar_top + int(solid_rows.min()), bar_top + int(solid_rows.max()) + 1
bar_left, bar_right = bar_left + int(solid_cols.min()), bar_left + int(solid_cols.max()) + 1
scan_scene.save_png(os.path.join(sprite_dir, "spacebar.png"), keys_image[bar_top:bar_bottom, bar_left:bar_right])
space_bar = dict(file="sprites/spacebar.png", left=bar_left, top=bar_top,
                 width=bar_right - bar_left, height=bar_bottom - bar_top)
print("SPACEBAR", space_bar)

with open(os.path.join(work_dir, "layers.json"), "w") as handle:
    json.dump(dict(frame=frame_data, layers={n: f"layers/{n}.png" for n in layers}, keys=keys,
                   space_bar=space_bar), handle, indent=1)
print("SPRITES", len(usable_keys))
