# Clack

A typewriter that replaces the phone keyboard. Every key, stem, typebar and roller on screen is
cut from a 3D scan of a real machine, rearranged on a standard phone keyboard grid and drawn
live with Skia.

## Credit

The machine is the **Underwood 5 typewriter** scanned by the
[Museum of Engineering and Technology, Krakow](https://sketchfab.com/3d-models/underwood-5-typewriter-ad4df24b943e4f6ea4b8336072b0d6ae)
(inv. no. MIM246/VII-44), licensed
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

Everything in `assets/machine/` is derived from that scan and carries the same licence:
credit the museum, no commercial use, share alike.

The sounds in `assets/sounds/` are cut from
[WWS Typewriter](https://commons.wikimedia.org/wiki/File:WWS_Typewriter.ogg), a recording of an
Erika 5 by **Work With Sounds / Konrad Gutkowski**, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). They were trimmed, faded and
levelled; `tools/audio/cut_sounds.sh` holds the exact cuts. The one exception is `turn.wav`, the
rub of the caps turning on their stems, which is synthesised by `tools/audio/make_turn.py`.

## Licence

The code is [MIT](LICENSE). The images and sounds are not: they keep the licences of the scan
and the recording they come from, which means **no commercial use** of the machine's images.
[assets/LICENSE.md](assets/LICENSE.md) has the detail.

## Run it

```sh
npm install
npx expo run:ios --port 8087
```

`npm install` skips Skia's install script on recent npm versions. If the iOS build cannot find
Skia's libraries, run `node scripts/install-libs.js` inside `node_modules/@shopify/react-native-skia`.

## Rebuilding the machine images

The scan itself (70 MB) is not in the repo. Download the glTF binary from the link above into
`model-src/underwood5/`, install Blender, then:

```sh
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python tools/blender/render_base.py -- model-src/underwood5/underwood_5_typewriter.glb renders/work
$B -b --python tools/blender/find_keys.py -- renders/work
$B -b --python tools/blender/split_layers.py -- model-src/underwood5/underwood_5_typewriter.glb renders/work
$B -b --python tools/blender/render_shade.py -- model-src/underwood5/underwood_5_typewriter.glb renders/work
$B -b --python tools/blender/render_legends.py -- renders/work
npm run assets
```

| Script | What it does |
| --- | --- |
| `render_base.py` | Renders the scan straight from above: its colours, and a height map aligned with them. |
| `find_keys.py` | Finds every key cap in the height map. |
| `split_layers.py` | Cuts the scan into body, carriage and keys, and one sprite per key. |
| `render_shade.py` | Renders light and shadow alone (sky light, and one lamp), in the same frame. |
| `lighting.py` | Mixes those two passes into the light map the export multiplies over the colours. |
| `render_legends.py` | Prints the legends the scan lacks (figures, punctuation, English function keys) as a sheet. |
| `strike_parts.py` | Draws the parts the scan cannot give: a typebar and its slug, and the stretch of ribbon it strikes. |
| `preview_light.py` | Side-by-side check: the scan as photographed, relit, and the light map. |
| `phone_layout.py` | Where each part goes on a 440 x 956 pt screen. Change the layout here. |
| `export_app_assets.py` | Writes the images and `layout.json` the app draws from. |
| `compose_phone.py` | Flattens the layout into one picture, to check it without the app. |

## Demo run-through

Double-tap the empty top-left corner of the desk and the machine plays a short film of itself,
through the same handlers fingers use. It types a first page ("Dear internet, / I am an
Underwood No. 5.", the name in red), throws the carriage back by hand, rings the bell, pulls
the page out and lays it on the pile, then types a second page ("Born in 1900. / Rebuilt in
React Native.") and holds it up. It lasts about 25 seconds. Touching the machine stops it.
The text is at the top of `src/engine/useDemo.ts`.
