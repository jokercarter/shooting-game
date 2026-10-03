"""Extract the reusable pixel symbols from the Figma visual kit.

The game uses a canvas renderer, so the board-sized Figma SVG is not a useful
runtime image by itself.  This small build helper turns its symbols into
standalone SVG sprites that can be loaded by the arena without duplicating the
art in JavaScript.  The pilot sprites intentionally omit the attached weapon;
the game draws the weapon separately so it can follow the player's aim.
"""

from __future__ import annotations

import copy
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "figma" / "morrow-fields-pixel-kit.svg"
DEST = ROOT / "public" / "arena" / "generated"
DEST.mkdir(parents=True, exist_ok=True)

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def attr_number(element: ET.Element, name: str) -> float:
    try:
        return float(element.attrib.get(name, "-inf"))
    except ValueError:
        return float("-inf")


def write_svg(name: str, view_box: str, children: list[ET.Element], width: int, height: int) -> None:
    root = ET.Element(
        f"{{{NS}}}svg",
        {
            "width": str(width),
            "height": str(height),
            "viewBox": view_box,
            "shape-rendering": "crispEdges",
        },
    )
    for child in children:
        root.append(copy.deepcopy(child))
    ET.ElementTree(root).write(DEST / name, encoding="utf-8", xml_declaration=True)


tree = ET.parse(SOURCE)
root = tree.getroot()
symbols = {el.attrib.get("id"): el for el in root.iter() if local_name(el.tag) == "symbol"}
patterns = {el.attrib.get("id"): el for el in root.iter() if local_name(el.tag) == "pattern"}

symbol_sizes = {
    "pilot": ("0 0 128 160", 128, 160),
    "weapon": ("0 0 120 72", 120, 72),
    "obstacle-tree": ("0 0 140 120", 140, 120),
    "obstacle-stump": ("0 0 140 100", 140, 100),
    "obstacle-crates": ("0 0 140 100", 140, 100),
    "obstacle-wall": ("0 0 180 100", 180, 100),
    "obstacle-spikes": ("0 0 140 80", 140, 80),
}

for symbol_id, symbol in symbols.items():
    if symbol_id.startswith("pilot-"):
        view_box, width, height = symbol_sizes["pilot"]
        # Remove only the two weapon rectangles in the hand; the right arm
        # also extends beyond x=88 and is part of the pilot silhouette.
        children = [child for child in symbol if not (
            local_name(child.tag) == "rect"
            and attr_number(child, "x") in {89, 108}
            and attr_number(child, "y") in {88, 90}
        )]
        write_svg(f"{symbol_id}-body.svg", view_box, children, width, height)
    elif symbol_id.startswith("weapon-"):
        view_box, width, height = symbol_sizes["weapon"]
        write_svg(f"{symbol_id}.svg", view_box, list(symbol), width, height)
    elif symbol_id in symbol_sizes:
        view_box, width, height = symbol_sizes[symbol_id]
        write_svg(f"{symbol_id}.svg", view_box, list(symbol), width, height)

for map_id in ("tidal", "glass", "ember"):
    pattern = patterns[f"grass-{map_id}"]
    wrapper = ET.Element(f"{{{NS}}}svg", {
        "width": "24",
        "height": "24",
        "viewBox": "0 0 24 24",
        "shape-rendering": "crispEdges",
    })
    defs = ET.SubElement(wrapper, f"{{{NS}}}defs")
    defs.append(copy.deepcopy(pattern))
    ET.SubElement(wrapper, f"{{{NS}}}rect", {"width": "24", "height": "24", "fill": f"url(#{pattern.attrib['id']})"})
    ET.ElementTree(wrapper).write(DEST / f"ground-{map_id}.svg", encoding="utf-8", xml_declaration=True)

print(f"extracted {len(list(DEST.glob('*.svg')))} arena sprites to {DEST}")
