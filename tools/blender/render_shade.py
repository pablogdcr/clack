"""Render how light falls on the scan, without its colours, in the same frame as render_base.py.

Run:  blender -b --python tools/blender/render_shade.py -- <model.glb> <out_dir> [--px-per-m 6000] [--samples 128]

The scan's texture was photographed under flat light, so parts look pasted on. These two
passes hold only light and shadow on a plain matte surface; multiplied over the colours
they give the machine depth:

    shade_sky.png   light from the whole sky: dark in crevices and under overhangs
    shade_key.png   one soft lamp above and to the left: form shading and cast shadows

Both are 16-bit linear data (read them with load_png(path, data=True)).
"""
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_scene import load_model, model_frame, render_to, setup_top_camera  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
model_path, out_dir = args[0], args[1]
px_per_m = float(args[args.index("--px-per-m") + 1]) if "--px-per-m" in args else 6000.0
samples = int(args[args.index("--samples") + 1]) if "--samples" in args else 128

# A matte surface reflecting 80% of the light, so nothing clips in the 0..1 range.
CLAY = 0.8
SKY_STRENGTH = 0.9
KEY_STRENGTH = 2.6
# Where the lamp light travels: steeply down from the left and a little from behind. A lamp
# further behind the machine would leave the whole keyboard in the shadow of the body.
KEY_DIRECTION = Vector((0.45, -0.15, -0.88))
# Apparent size of the lamp; larger gives softer shadow edges.
KEY_ANGLE_DEG = 22

obj = load_model(model_path)
frame = model_frame(obj)
setup_top_camera(frame, px_per_m)
scene = bpy.context.scene

for material in bpy.data.materials:
    if not material.use_nodes:
        continue
    tree = material.node_tree
    shader = next((n for n in tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if shader is None:
        continue
    # Drop colour, metal and gloss; keep the normal map, which carries the fine relief.
    for name in ("Base Color", "Metallic", "Roughness"):
        for link in list(shader.inputs[name].links):
            tree.links.remove(link)
    shader.inputs["Base Color"].default_value = (CLAY, CLAY, CLAY, 1)
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 1
    shader.inputs["Specular IOR Level"].default_value = 0

scene.render.engine = "CYCLES"
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Raw"
scene.render.image_settings.color_depth = "16"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    scene.cycles.device = "GPU"
except Exception as error:  # falls back to CPU
    print("GPU setup skipped:", error)

world = bpy.data.worlds.new("Sky")
world.use_nodes = True
background = world.node_tree.nodes["Background"]
background.inputs["Color"].default_value = (1, 1, 1, 1)
scene.world = world

sun_data = bpy.data.lights.new("Key", type="SUN")
sun_data.angle = KEY_ANGLE_DEG * 3.14159265 / 180
sun = bpy.data.objects.new("Key", sun_data)
scene.collection.objects.link(sun)
sun.rotation_euler = KEY_DIRECTION.normalized().to_track_quat("-Z", "Y").to_euler()

os.makedirs(out_dir, exist_ok=True)

background.inputs["Strength"].default_value = SKY_STRENGTH
sun_data.energy = 0
render_to(os.path.join(out_dir, "shade_sky.png"))

background.inputs["Strength"].default_value = 0
sun_data.energy = KEY_STRENGTH
render_to(os.path.join(out_dir, "shade_key.png"))

print("SHADE", scene.render.resolution_x, "x", scene.render.resolution_y, "->", out_dir)
