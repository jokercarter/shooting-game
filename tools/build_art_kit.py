"""Build the Morrow Fields art kit as flat vector SVGs.

One palette and one outline rule drive every asset, so the four categories
(ground, obstacles, pilots, weapons) stay in the same family. Run from the
project root:

    python tools/build_art_kit.py

Outputs into public/arena/generated/.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "arena" / "generated"

# --------------------------------------------------------------------------
# Palette: bright, high-key, two-step shading, one deep navy ink.
# --------------------------------------------------------------------------
INK = "#1b2438"
INK_SOFT = "#2c3852"
CREAM = "#fdf6dd"
SKIN = "#f2c9a0"

GROUND = {
    # map id: (base, shade, light, speck)
    "tidal": ("#78c96a", "#5db257", "#a5e08d", "#4c9a48"),
    "glass": ("#aed268", "#93bc52", "#d8e996", "#7fa544"),
    "ember": ("#cf9468", "#b57850", "#e8b78c", "#9a5f3f"),
}

STONE = ("#d5dde8", "#a9b4c5", "#727f94", "#eef3f9")
WOOD = ("#dda666", "#b87c42", "#7d4f27", "#f4cd94")
STEEL = ("#c3ccd9", "#909db1", "#5a6577", "#eaf0f8")

WATER = {
    "tidal": ("#4ec4e2", "#a6e9f6", "#2a86a9", "#f0d39a"),
    "glass": ("#4aa9d8", "#9fd8f2", "#256f9c", "#efd7a4"),
    "ember": ("#7f6fd0", "#b7a6ef", "#4a3d8c", "#e9c39a"),
}

JACKETS = {
    "wayfinder": ("#2fbfa0", "#1d8f78", "#8ff0d8"),
    "orchard":   ("#9bd24a", "#749f2f", "#d4f18d"),
    "ember":     ("#ef7a52", "#c05334", "#ffb08c"),
    "gear":      ("#f2c14e", "#c1932f", "#ffe39a"),
}
TROUSERS = "#333c5c"
BOOT = "#242c44"

WEAPON = {
    "pulse":  ("#5ce1e6", "#2f9aa8", "#d6fbff"),
    "flame":  ("#ff9a3c", "#c9641c", "#ffe0b0"),
    "lobber": ("#f2b544", "#b87c1f", "#ffe6a8"),
    "prism":  ("#b98cff", "#7f56c4", "#e6d6ff"),
    "heal":   ("#7ee08a", "#48a75c", "#d8ffdd"),
    "rail":   ("#d8f6ff", "#7fb4c9", "#ffffff"),
}


def svg(width, height, body, extra=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" shape-rendering="geometricPrecision"{extra}>'
        f"{body}</svg>\n"
    )


def write(name, content):
    (OUT / name).write_text(content, encoding="utf-8")


# --------------------------------------------------------------------------
# Ground: 24x24 tiles. Deliberately low contrast so units stay readable.
# --------------------------------------------------------------------------
def ground_tiles():
    for key, (base, shade, light, speck) in GROUND.items():
        marks = [
            # short grass blades, three tones
            f'<path d="M4 17l1.6-4 1.6 4" fill="none" stroke="{shade}" stroke-width="1.5" stroke-linecap="round"/>',
            f'<path d="M12 8l1.4-3.4 1.4 3.4" fill="none" stroke="{light}" stroke-width="1.5" stroke-linecap="round"/>',
            f'<path d="M17 19l1.4-3.2 1.4 3.2" fill="none" stroke="{shade}" stroke-width="1.4" stroke-linecap="round"/>',
            f'<circle cx="7" cy="6" r="1.1" fill="{light}"/>',
            f'<circle cx="20" cy="11" r="1" fill="{speck}"/>',
            f'<circle cx="9" cy="21" r="0.9" fill="{speck}"/>',
            f'<circle cx="15" cy="15" r="0.8" fill="{light}"/>',
        ]
        if key == "glass":
            marks.append(
                f'<circle cx="4" cy="11" r="1.3" fill="{light}"/>'
                f'<circle cx="19" cy="6" r="1.3" fill="{light}"/>'
            )
        if key == "ember":
            marks.append(
                '<path d="M8 13c1.6-.6 2.2-2 2.6-3.2.6 1.6 1.8 2.2 3 2.4-1 .8-1.6 1.8-1.8 3-1.2-.4-2.6-.6-3.8 0z" '
                'fill="#e0653f" opacity=".75"/>'
            )
        body = f'<rect width="24" height="24" fill="{base}"/>' + "".join(marks)
        write(f"ground-{key}.svg", svg(24, 24, body))


# --------------------------------------------------------------------------
# Obstacles: chunky rounded volumes, cream top light, navy outline.
# --------------------------------------------------------------------------
def wall():
    top, mid, dark, light = STONE
    b = [
        f'<ellipse cx="90" cy="90" rx="78" ry="9" fill="{INK}" opacity=".22"/>',
        f'<rect x="10" y="14" width="160" height="72" rx="10" fill="{mid}" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="18" y="20" width="144" height="30" rx="6" fill="{light}"/>',
        f'<rect x="18" y="54" width="144" height="26" rx="6" fill="{top}" opacity=".55"/>',
    ]
    joints = []
    for row, y in enumerate((20, 38, 56, 72)):
        offset = 0 if row % 2 == 0 else 24
        for x in range(18 + offset, 164, 48):
            joints.append(f'<rect x="{x}" y="{y}" width="4" height="14" rx="2" fill="{dark}" opacity=".55"/>')
    joints.append(f'<rect x="18" y="50" width="144" height="3.4" fill="{dark}" opacity=".35"/>')
    b += joints
    write("obstacle-wall.svg", svg(180, 100, "".join(b)))


def crates():
    top, mid, dark, light = WOOD
    b = [
        f'<ellipse cx="70" cy="90" rx="58" ry="8" fill="{INK}" opacity=".22"/>',
        # back crate
        f'<rect x="62" y="10" width="66" height="56" rx="7" fill="{mid}" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="70" y="17" width="50" height="18" rx="4" fill="{light}" opacity=".8"/>',
        # front crate
        f'<rect x="12" y="26" width="80" height="62" rx="8" fill="{top}" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="20" y="33" width="64" height="22" rx="5" fill="{light}" opacity=".85"/>',
        # braces
        f'<path d="M18 34l68 48M86 34L18 82" stroke="{dark}" stroke-width="6" stroke-linecap="round" opacity=".55"/>',
        # metal corners
        f'<rect x="12" y="26" width="12" height="12" rx="3" fill="{STEEL[0]}" stroke="{INK}" stroke-width="3"/>',
        f'<rect x="80" y="76" width="12" height="12" rx="3" fill="{STEEL[0]}" stroke="{INK}" stroke-width="3"/>',
    ]
    write("obstacle-crates.svg", svg(140, 100, "".join(b)))


def tree():
    leaf, leaf_dark, leaf_light = "#4aa85e", "#2f7d45", "#7fd38a"
    b = [
        f'<ellipse cx="70" cy="106" rx="46" ry="9" fill="{INK}" opacity=".22"/>',
        f'<rect x="60" y="64" width="20" height="42" rx="6" fill="{WOOD[1]}" stroke="{INK}" stroke-width="5"/>',
        f'<circle cx="70" cy="44" r="34" fill="{leaf_dark}" stroke="{INK}" stroke-width="5"/>',
        f'<circle cx="70" cy="40" r="28" fill="{leaf}"/>',
        f'<circle cx="59" cy="32" r="12" fill="{leaf_light}" opacity=".85"/>',
        f'<circle cx="45" cy="52" r="16" fill="{leaf_dark}" stroke="{INK}" stroke-width="4"/>',
        f'<circle cx="96" cy="54" r="15" fill="{leaf_dark}" stroke="{INK}" stroke-width="4"/>',
        f'<circle cx="66" cy="24" r="9" fill="{leaf}" opacity=".9"/>',
    ]
    write("obstacle-tree.svg", svg(140, 120, "".join(b)))


def stump():
    top, mid, dark, light = WOOD
    b = [
        f'<ellipse cx="70" cy="88" rx="44" ry="8" fill="{INK}" opacity=".22"/>',
        f'<path d="M26 58h88v18c0 12-20 20-44 20S26 88 26 76z" fill="{mid}" stroke="{INK}" stroke-width="5"/>',
        f'<ellipse cx="70" cy="58" rx="44" ry="18" fill="{light}" stroke="{INK}" stroke-width="5"/>',
        f'<ellipse cx="70" cy="58" rx="30" ry="11" fill="none" stroke="{mid}" stroke-width="3.5"/>',
        f'<ellipse cx="70" cy="58" rx="16" ry="5.5" fill="none" stroke="{mid}" stroke-width="3"/>',
        f'<path d="M34 44l-10-12M104 46l12-10" stroke="{mid}" stroke-width="7" stroke-linecap="round"/>',
    ]
    write("obstacle-stump.svg", svg(140, 100, "".join(b)))


def spikes():
    base, mid, dark, light = STEEL
    spikes = []
    for i, x in enumerate(range(20, 128, 22)):
        spikes.append(
            f'<path d="M{x} 52l11-34 11 34z" fill="{light}" stroke="{INK}" stroke-width="4.5" stroke-linejoin="round"/>'
        )
    b = [
        f'<ellipse cx="70" cy="66" rx="52" ry="7" fill="{INK}" opacity=".2"/>',
        "".join(spikes),
        f'<rect x="10" y="50" width="120" height="18" rx="8" fill="{mid}" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="18" y="55" width="104" height="6" rx="3" fill="{dark}" opacity=".45"/>',
    ]
    write("obstacle-spikes.svg", svg(140, 80, "".join(b)))


# --------------------------------------------------------------------------
# Pilots: 128x160, facing right, rounded flat cartoon with a bold outline.
# --------------------------------------------------------------------------
def pilot(key):
    jacket, jacket_dark, jacket_light = JACKETS[key]
    helmet = jacket_dark
    b = [
        # ground shadow
        f'<ellipse cx="64" cy="146" rx="34" ry="9" fill="{INK}" opacity=".26"/>',
        # boots
        f'<rect x="40" y="126" width="22" height="18" rx="7" fill="{BOOT}" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="68" y="126" width="22" height="18" rx="7" fill="{BOOT}" stroke="{INK}" stroke-width="5"/>',
        # legs
        f'<rect x="44" y="94" width="40" height="38" rx="10" fill="{TROUSERS}" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="50" y="100" width="28" height="10" rx="5" fill="{jacket_dark}" opacity=".5"/>',
        # backpack behind shoulders
        f'<rect x="30" y="62" width="18" height="34" rx="7" fill="{jacket_dark}" stroke="{INK}" stroke-width="5"/>',
        # torso
        f'<rect x="38" y="58" width="52" height="48" rx="16" fill="{jacket}" stroke="{INK}" stroke-width="5"/>',
        # chest strap + badge
        f'<path d="M42 70h44" stroke="{CREAM}" stroke-width="6" stroke-linecap="round" opacity=".9"/>',
        f'<circle cx="64" cy="88" r="7" fill="{CREAM}" stroke="{INK}" stroke-width="3"/>',
        # arms
        f'<rect x="80" y="66" width="16" height="34" rx="8" fill="{jacket}" stroke="{INK}" stroke-width="5"/>',
        f'<rect x="34" y="66" width="16" height="34" rx="8" fill="{jacket_dark}" stroke="{INK}" stroke-width="5"/>',
        # hands
        f'<circle cx="88" cy="102" r="7" fill="{SKIN}" stroke="{INK}" stroke-width="4"/>',
        f'<circle cx="42" cy="102" r="7" fill="{SKIN}" stroke="{INK}" stroke-width="4"/>',
        # neck + head
        f'<rect x="56" y="46" width="16" height="14" rx="6" fill="{SKIN}" stroke="{INK}" stroke-width="4"/>',
        f'<circle cx="64" cy="34" r="21" fill="{SKIN}" stroke="{INK}" stroke-width="5"/>',
        # helmet dome
        f'<path d="M43 32a21 21 0 0 1 42 0z" fill="{helmet}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>',
        f'<path d="M50 22a15 15 0 0 1 16-8" fill="none" stroke="{jacket_light}" stroke-width="5" stroke-linecap="round" opacity=".9"/>',
        # visor
        f'<rect x="66" y="24" width="20" height="9" rx="4.5" fill="{INK_SOFT}" stroke="{INK}" stroke-width="3"/>',
        f'<rect x="69" y="26" width="8" height="4" rx="2" fill="{jacket_light}" opacity=".95"/>',
        # shoulder pads read at thumbnail size
        f'<rect x="84" y="58" width="18" height="14" rx="7" fill="{jacket_light}" stroke="{INK}" stroke-width="4"/>',
        f'<rect x="28" y="58" width="18" height="14" rx="7" fill="{jacket_light}" stroke="{INK}" stroke-width="4"/>',
    ]
    write(f"pilot-{key}-body.svg", svg(128, 160, "".join(b)))


# --------------------------------------------------------------------------
# Weapons: 120x72 side profiles, role colour + cream highlight.
# --------------------------------------------------------------------------
def weapon(key):
    base, dark, light = WEAPON[key]
    common = f'stroke="{INK}" stroke-width="4.5" stroke-linejoin="round"'
    if key == "pulse":
        b = [
            f'<rect x="18" y="28" width="70" height="20" rx="8" fill="{base}" {common}/>',
            f'<rect x="24" y="31" width="44" height="7" rx="3.5" fill="{light}"/>',
            f'<rect x="84" y="32" width="26" height="12" rx="6" fill="{dark}" {common}/>',
            f'<rect x="106" y="35" width="10" height="6" rx="3" fill="{light}"/>',
            f'<rect x="44" y="46" width="20" height="16" rx="6" fill="{dark}" {common}/>',
        ]
    elif key == "flame":
        b = [
            f'<rect x="14" y="30" width="44" height="24" rx="8" fill="{dark}" {common}/>',
            f'<rect x="52" y="34" width="46" height="16" rx="7" fill="{base}" {common}/>',
            f'<path d="M96 34l16 8-16 8z" fill="{light}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>',
            f'<rect x="20" y="35" width="30" height="6" rx="3" fill="{light}" opacity=".85"/>',
        ]
    elif key == "lobber":
        b = [
            f'<circle cx="58" cy="38" r="22" fill="{base}" {common}/>',
            f'<circle cx="58" cy="38" r="12" fill="{dark}"/>',
            f'<circle cx="58" cy="38" r="5" fill="{light}"/>',
            f'<rect x="80" y="30" width="30" height="16" rx="7" fill="{dark}" {common}/>',
            f'<rect x="20" y="34" width="18" height="22" rx="6" fill="{dark}" {common}/>',
        ]
    elif key == "prism":
        b = [
            f'<rect x="24" y="32" width="52" height="16" rx="7" fill="{dark}" {common}/>',
            f'<path d="M72 22l24 16-24 16z" fill="{base}" stroke="{INK}" stroke-width="4.5" stroke-linejoin="round"/>',
            f'<path d="M80 30l10 8-10 8z" fill="{light}"/>',
            f'<rect x="16" y="36" width="16" height="10" rx="4" fill="{light}"/>',
        ]
    elif key == "heal":
        b = [
            f'<rect x="26" y="28" width="50" height="24" rx="10" fill="{base}" {common}/>',
            f'<rect x="76" y="32" width="24" height="16" rx="7" fill="{dark}" {common}/>',
            f'<rect x="46" y="32" width="6" height="16" rx="2" fill="{light}"/>',
            f'<rect x="41" y="37" width="16" height="6" rx="2" fill="{light}"/>',
        ]
    else:  # rail
        b = [
            f'<rect x="10" y="31" width="92" height="12" rx="6" fill="{base}" {common}/>',
            f'<rect x="18" y="34" width="66" height="4" rx="2" fill="{light}"/>',
            f'<rect x="52" y="42" width="18" height="14" rx="5" fill="{dark}" {common}/>',
            f'<rect x="96" y="28" width="8" height="18" rx="4" fill="{dark}" {common}/>',
        ]
    write(f"weapon-{key}.svg", svg(120, 72, "".join(b)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ground_tiles()
    wall()
    crates()
    tree()
    stump()
    spikes()
    for key in JACKETS:
        pilot(key)
    for key in WEAPON:
        weapon(key)
    print(f"wrote {len(list(OUT.glob('*.svg')))} svg assets into {OUT}")


if __name__ == "__main__":
    main()
