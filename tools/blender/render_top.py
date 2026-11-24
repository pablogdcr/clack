"""Render the scanned typewriter straight from above with an orthographic camera.

Run:  blender -b --python tools/blender/render_top.py -- <model.glb> <out.png> [--mode albedo|lit] [--px-per-m 6000] [--flip]

albedo  the scan's own colours, no lighting added (what the museum photographed)
lit     the scan's material under a soft overhead light, for contact shadows and sheen
"""
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
model_path, out_path = args[0], args[1]
mode = args[args.index("--mode") + 1] if "--mode" in args else "albedo"
px_per_m = float(args[args.index("--px-per-m") + 1]) if "--px-per-m" in args else 6000.0
flip = "--flip" in args

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=model_path)
scene = bpy.context.scene

# World-space bounds of the whole machine.
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for obj in meshes:
    for corner in obj.bound_box:
        world = obj.matrix_world @ Vector(corner)
        lo = Vector(map(min, lo, world))
        hi = Vector(map(max, hi, world))
size = hi - lo
centre = (lo + hi) / 2
margin = 0.02

# Orthographic camera looking straight down.
cam_data = bpy.data.cameras.new("TopCam")
cam_data.type = "ORTHO"
width_m = size.x + 2 * margin
height_m = size.y + 2 * margin
cam_data.ortho_scale = max(width_m, height_m)
cam_data.clip_end = 10
cam = bpy.data.objects.new("TopCam", cam_data)
scene.collection.objects.link(cam)
cam.location = (centre.x, centre.y, hi.z + 1.0)
cam.rotation_euler = (0, 0, math.pi if flip else 0)
scene.camera = cam

scene.render.resolution_x = round(width_m * px_per_m)
scene.render.resolution_y = round(height_m * px_per_m)
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = out_path
scene.view_settings.view_transform = "Standard"

if mode == "albedo":
    # Bypass shading: send the colour texture straight to the surface.
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        tree = material.node_tree
        colour_tex = next(
            (n for n in tree.nodes if n.bl_idname == "ShaderNodeTexImage" and n.image
             and n.image.colorspace_settings.name == "sRGB"),
            None,
        )
        output = next(n for n in tree.nodes if n.bl_idname == "ShaderNodeOutputMaterial")
        if colour_tex is None:
            continue
        emission = tree.nodes.new("ShaderNodeEmission")
        tree.links.new(colour_tex.outputs["Color"], emission.inputs["Color"])
        tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    scene.render.engine = "BLENDER_EEVEE"
else:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
        scene.cycles.device = "GPU"
    except Exception as error:  # falls back to CPU
        print("GPU setup skipped:", error)

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.world = world

    # One large soft light above and slightly toward the typist, like a desk lamp.
    light_data = bpy.data.lights.new("Key", type="AREA")
    light_data.energy = 220
    light_data.size = 1.2
    light = bpy.data.objects.new("Key", light_data)
    scene.collection.objects.link(light)
    light.location = (centre.x - 0.25, centre.y - 0.35, hi.z + 0.9)
    direction = Vector((centre.x, centre.y, centre.z)) - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

print("RENDER", mode, scene.render.resolution_x, "x", scene.render.resolution_y, "->", out_path)
bpy.ops.render.render(write_still=True)
