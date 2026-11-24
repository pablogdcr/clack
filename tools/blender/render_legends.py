"""Print the legends the scan does not have: figures, punctuation, English function keys.

Run:  blender -b --python tools/blender/render_legends.py -- <work_dir>
Writes: legends.png   one white legend per cell on black, in the order of phone_layout.LEGENDS

The sheet is drawn at the size of a scanned key cap (6000 px/m), so a legend can be laid
straight onto a cap sprite. The export does that, in ink, after wiping the cap's own legend.
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phone_layout as L  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
work_dir = os.path.abspath(args[0])

# The scan's letters are a light geometric sans, its function keys a condensed bold one.
GLYPH_FONT = "/System/Library/Fonts/Supplemental/Futura.ttc"
LABEL_FONT = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
GLYPH_CAP_PX = 36            # height of a capital letter on the scanned caps
LABEL_CAP_PX = 17            # height of the lettering on the scanned function keys
SMALL_MARKS = set(".,:;'\"-")  # drawn larger, or they vanish at phone size
SMALL_MARK_SCALE = 1.5
SMALL_MARK_SPREAD = 0.4     # how much of their natural height above or below the middle they keep

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
cell = L.LEGEND_CELL
columns = L.LEGEND_COLUMNS
rows = -(-len(L.LEGENDS) // columns)
sheet_w, sheet_h = columns * cell, rows * cell

ink = bpy.data.materials.new("Ink")
ink.use_nodes = True
tree = ink.node_tree
tree.nodes.clear()
emission = tree.nodes.new("ShaderNodeEmission")
emission.inputs["Color"].default_value = (1, 1, 1, 1)
output = tree.nodes.new("ShaderNodeOutputMaterial")
tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])


def make_text(body, font, size):
    curve = bpy.data.curves.new("legend", type="FONT")
    curve.body = body
    curve.font = font
    curve.size = size
    curve.align_x = "CENTER"
    curve.space_line = 0.82
    curve.materials.append(ink)
    obj = bpy.data.objects.new("legend", curve)
    scene.collection.objects.link(obj)
    return obj


def bounds(obj):
    bpy.context.view_layer.update()
    xs = [corner[0] for corner in obj.bound_box]
    ys = [corner[1] for corner in obj.bound_box]
    return min(xs), max(xs), min(ys), max(ys)


def cap_height(font):
    """Height of a capital letter at size 1, in Blender units."""
    probe = make_text("H", font, 1)
    _, _, low, high = bounds(probe)
    bpy.data.objects.remove(probe)
    return high - low


glyph_font = bpy.data.fonts.load(GLYPH_FONT)
label_font = bpy.data.fonts.load(LABEL_FONT)
glyph_size = GLYPH_CAP_PX / cap_height(glyph_font)
label_size = LABEL_CAP_PX / cap_height(label_font)

for index, legend in enumerate(L.LEGENDS):
    centre_x = (index % columns + 0.5) * cell
    centre_y = sheet_h - (index // columns + 0.5) * cell
    if len(legend) == 1:
        scale = SMALL_MARK_SCALE if legend in SMALL_MARKS else 1
        obj = make_text(legend, glyph_font, glyph_size * scale)
        left, right, low, high = bounds(obj)
        # Centred sideways. Up and down, the baseline sits where a capital letter's would, so
        # a full stop is low and an apostrophe high, as printed; small marks are then pulled
        # part of the way back to the middle, or they would land on the cap's ring.
        lift = -GLYPH_CAP_PX * scale / 2
        if legend in SMALL_MARKS:
            lift -= (1 - SMALL_MARK_SPREAD) * (lift + (low + high) / 2)
        obj.location = (centre_x - (left + right) / 2, centre_y + lift, 0)
    else:
        obj = make_text(legend, label_font, label_size)
        left, right, low, high = bounds(obj)
        obj.location = (centre_x - (left + right) / 2, centre_y - (low + high) / 2, 0)

camera_data = bpy.data.cameras.new("Sheet")
camera_data.type = "ORTHO"
camera_data.ortho_scale = max(sheet_w, sheet_h)
camera = bpy.data.objects.new("Sheet", camera_data)
scene.collection.objects.link(camera)
camera.location = (sheet_w / 2, sheet_h / 2, 10)
scene.camera = camera

world = bpy.data.worlds.new("Black")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
scene.world = world
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = sheet_w
scene.render.resolution_y = sheet_h
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
# Raw: the stored number is the share of the pixel a legend covers.
scene.view_settings.view_transform = "Raw"
scene.render.filepath = os.path.join(work_dir, "legends.png")
bpy.ops.render.render(write_still=True)
print("LEGENDS", len(L.LEGENDS), "on", sheet_w, "x", sheet_h)
