"""Shared helpers for working on the scanned typewriter inside Blender.

Every script uses the same top-down frame, so a pixel in one output lines up
with the same pixel in every other output:

    px = (x - frame.x0) * px_per_m          (left to right)
    py = (frame.y1 - y) * px_per_m          (top to bottom; the keyboard is at the bottom)
"""
import math
from dataclasses import dataclass

import bpy
import numpy as np
from mathutils import Vector

MARGIN_M = 0.02


@dataclass
class Frame:
    """World-space rectangle seen by the top-down camera."""
    x0: float
    x1: float
    y0: float
    y1: float
    z0: float
    z1: float

    @property
    def width(self):
        return self.x1 - self.x0

    @property
    def height(self):
        return self.y1 - self.y0

    def size_px(self, px_per_m):
        return round(self.width * px_per_m), round(self.height * px_per_m)


def load_model(path):
    """Import the scan and merge its chunks into one object with transforms applied."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = "Typewriter"
    return obj


def model_frame(obj):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for corner in obj.bound_box:
        world = obj.matrix_world @ Vector(corner)
        lo = Vector(map(min, lo, world))
        hi = Vector(map(max, hi, world))
    return Frame(lo.x - MARGIN_M, hi.x + MARGIN_M, lo.y - MARGIN_M, hi.y + MARGIN_M, lo.z, hi.z)


def triangles(obj):
    """Return (vertex coords [V,3], triangle vertex indices [T,3], triangle polygon index [T])."""
    mesh = obj.data
    mesh.calc_loop_triangles()
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", co)
    tri = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
    mesh.loop_triangles.foreach_get("vertices", tri)
    poly = np.empty(len(mesh.loop_triangles), dtype=np.int32)
    mesh.loop_triangles.foreach_get("polygon_index", poly)
    return co.reshape(-1, 3), tri.reshape(-1, 3), poly


def setup_top_camera(frame, px_per_m):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("TopCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(frame.width, frame.height)
    cam_data.clip_end = 10
    cam = bpy.data.objects.new("TopCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = ((frame.x0 + frame.x1) / 2, (frame.y0 + frame.y1) / 2, frame.z1 + 1.0)
    cam.rotation_euler = (0, 0, 0)
    scene.camera = cam
    width, height = frame.size_px(px_per_m)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    return cam


def use_albedo_materials():
    """Bypass shading: the scan's colour texture goes straight to the surface."""
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        tree = material.node_tree
        colour_tex = next(
            (n for n in tree.nodes if n.bl_idname == "ShaderNodeTexImage" and n.image
             and n.image.colorspace_settings.name == "sRGB"),
            None,
        )
        output = next((n for n in tree.nodes if n.bl_idname == "ShaderNodeOutputMaterial"), None)
        if colour_tex is None or output is None:
            continue
        emission = tree.nodes.new("ShaderNodeEmission")
        tree.links.new(colour_tex.outputs["Color"], emission.inputs["Color"])
        tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    bpy.context.scene.render.engine = "BLENDER_EEVEE"


def use_height_materials(frame):
    """Paint every surface with its own height: 0 at frame.z0, 1 at frame.z1."""
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        tree = material.node_tree
        output = next((n for n in tree.nodes if n.bl_idname == "ShaderNodeOutputMaterial"), None)
        if output is None:
            continue
        geometry = tree.nodes.new("ShaderNodeNewGeometry")
        split = tree.nodes.new("ShaderNodeSeparateXYZ")
        remap = tree.nodes.new("ShaderNodeMapRange")
        remap.inputs["From Min"].default_value = frame.z0
        remap.inputs["From Max"].default_value = frame.z1
        emission = tree.nodes.new("ShaderNodeEmission")
        tree.links.new(geometry.outputs["Position"], split.inputs["Vector"])
        tree.links.new(split.outputs["Z"], remap.inputs["Value"])
        tree.links.new(remap.outputs["Result"], emission.inputs["Color"])
        tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Raw"
    scene.render.image_settings.color_depth = "16"
    scene.render.dither_intensity = 0
    # One sample and a tiny filter, so heights are not blended across edges.
    scene.render.filter_size = 0.01
    scene.eevee.taa_render_samples = 1


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def save_png(path, rgba):
    """Write an HxWx4 float array (0..1, rows top to bottom) as an 8-bit PNG."""
    height, width, _ = rgba.shape
    image = bpy.data.images.new("out", width, height, alpha=True)
    image.pixels.foreach_set(np.ascontiguousarray(rgba[::-1], dtype=np.float32).ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def load_png(path, data=False):
    """Read a PNG as an HxWx4 float array (0..1, rows top to bottom).

    data=True reads the stored numbers as they are, for non-colour images such as height maps.
    """
    image = bpy.data.images.load(path)
    if data:
        image.colorspace_settings.name = "Non-Color"
    width, height = image.size
    flat = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(flat)
    bpy.data.images.remove(image)
    return flat.reshape(height, width, 4)[::-1].copy()


def heightmap(obj, frame, px_per_m):
    """Highest surface under each pixel, in metres (NaN where there is nothing)."""
    co, tri, _ = triangles(obj)
    width, height = frame.size_px(px_per_m)
    grid = np.full(height * width, -np.inf, dtype=np.float32)
    a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    # Sample each triangle on a small barycentric lattice so no pixel under it is missed.
    steps = 4
    for i in range(steps + 1):
        for j in range(steps + 1 - i):
            u, v = i / steps, j / steps
            point = a * (1 - u - v) + b * u + c * v
            px = np.floor((point[:, 0] - frame.x0) * px_per_m).astype(np.int64)
            py = np.floor((frame.y1 - point[:, 1]) * px_per_m).astype(np.int64)
            ok = (px >= 0) & (px < width) & (py >= 0) & (py < height)
            np.maximum.at(grid, py[ok] * width + px[ok], point[ok, 2])
    grid[np.isinf(grid)] = np.nan
    return grid.reshape(height, width)
