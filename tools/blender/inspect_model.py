"""Print what the scanned typewriter model contains: objects, size, materials, textures.

Run:  blender -b --python tools/blender/inspect_model.py -- <model.glb>
"""
import sys

import bpy
from mathutils import Vector

model_path = sys.argv[sys.argv.index("--") + 1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=model_path)

print("=== OBJECTS")
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for obj in bpy.data.objects:
    line = f"{obj.type:6} {obj.name!r} parent={obj.parent.name if obj.parent else None}"
    if obj.type == "MESH":
        mesh = obj.data
        line += f" verts={len(mesh.vertices)} polys={len(mesh.polygons)} mats={[m.name for m in mesh.materials]}"
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, world))
            hi = Vector(map(max, hi, world))
    print(line)

print("=== WORLD BOUNDS (x, y, z)")
print("min", tuple(round(v, 4) for v in lo))
print("max", tuple(round(v, 4) for v in hi))
print("size", tuple(round(v, 4) for v in (hi - lo)))

print("=== IMAGES")
for image in bpy.data.images:
    print(image.name, tuple(image.size), image.colorspace_settings.name)

print("=== MATERIALS")
for material in bpy.data.materials:
    nodes = [n.bl_idname for n in material.node_tree.nodes] if material.use_nodes else []
    print(material.name, nodes)
