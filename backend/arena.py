"""Server-authoritative rooms for the original Morrow Fields game."""
import asyncio
import json
import logging
import math
import os
import random
import secrets
import time
from collections import deque
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

PROFILE_ROOM_TICKS = os.environ.get("ARENA_PROFILE_TICKS") == "1"
logger = logging.getLogger(__name__)

router = APIRouter()
WIDTH, HEIGHT = 3000, 2000
MAP_SCALE = 3.125
TICK_RATE = 1 / 20
FIELD_UNIT_PX = 30
STATE_INTERVAL_CROWDED = 1 / 10
STATE_CROWD_THRESHOLD = 16
STATE_SHARED_VIEW_THRESHOLD = 8
FAST_TICK_RATE = 1 / 90
PROJECTILE_VIEW_FIELDS = frozenset({
    "id", "owner", "weapon", "age", "x", "y", "vx", "vy", "total_life",
    "kind", "blast", "color", "damage",
})
PROJECTILE_FLOAT_FIELDS = frozenset({
    "age", "x", "y", "vx", "vy", "total_life", "blast",
})
PLAYER_DYNAMIC_VIEW_FIELDS = frozenset({
    "id", "x", "y", "angle", "hp", "weapon", "alternate_fire",
    "skill_points", "max_hp", "armor", "max_armor", "score", "kills", "deaths", "shielded",
    "jumping", "dead", "respawn_in", "invincible", "hidden", "lives",
    "cover_exposed", "captures", "souls", "carried_flag", "switch_remaining",
})
ROOM_CAPACITIES = {
    "normal": 20,
    "zombie_dm": 24,
    "team_dm": 20,
    "ctf": 20,
    "duel": 2,
    "zombie_coop": 24,
}
MAX_PLAYERS = max(ROOM_CAPACITIES.values())
RESPAWN_DELAY = 7.0
SPAWN_INVINCIBILITY = 5.0
ITEM_RESPAWN = 45.0
RESOURCE_RESPAWN = 38.0
COVER_EXPOSURE_SECONDS = 3.0
WEAPON_SWITCH_DELAY = 1.0
START_ENERGY = 10.0
ENERGY_REGEN_RATE_PER_TICK = 0.05
ENERGY_REGEN_RATE_PER_SECOND = ENERGY_REGEN_RATE_PER_TICK / TICK_RATE
ABILITY_ENERGY_COSTS = {"shield": 33.0, "repair": 20.0}
# User-requested pacing adjustment: keep the reference weapon table intact,
# then apply transparent runtime scales to simulation velocities.
PLAYER_SPEED_SCALE = .84
PROJECTILE_SPEED_SCALE = .85
MISSILE_SPEED_SCALE = .82
HOMING_TURN_SCALE = .70
MISSILE_KINDS = {"rocket", "seeker", "cursor", "bug"}
MISSILE_BLAST_SCALE = 1.30
PLAYER_PORTAL_COOLDOWN_SECONDS = 5.0
PORTAL_EXIT_PADDING = 20

# Original arenas with a compact pixel-art forest and ruins theme.
MAPS = {
    "tidal": {
        "name": "Mosswood Crossing", "accent": "#c9da64", "ground": "#42633a",
        "cover": [[48, 230, 100, 62], [826, 84, 88, 54], [42, 474, 92, 56],
                  [824, 470, 92, 56], [184, 182, 68, 42], [708, 182, 68, 42],
                  [164, 350, 68, 40], [732, 348, 68, 40], [300, 92, 68, 44],
                  [592, 92, 70, 44], [292, 470, 72, 44], [596, 468, 72, 44],
                  [350, 264, 58, 34], [552, 264, 58, 34], [346, 370, 58, 34],
                  [552, 368, 58, 34]],
        # Walls are arranged as broken rooms and bridge-entry chokes.  The
        # openings are intentional: players can rotate around each cluster
        # instead of facing a repeated left/right obstacle grid.
        "obstacles": [
            # Offset corner rooms leave a diagonal route around each spawn lane.
            [96, 88, 48, 22], [154, 112, 24, 48], [96, 176, 50, 22],
            [236, 92, 46, 22], [294, 122, 22, 44], [332, 150, 46, 22],
            [776, 92, 48, 22], [722, 122, 24, 46], [780, 180, 48, 22],
            [642, 96, 44, 22], [684, 130, 22, 44], [620, 180, 46, 22],
            # Mid-field cover is staggered so the river crossings are visible.
            [88, 266, 52, 22], [148, 296, 22, 46], [96, 354, 46, 22],
            [232, 250, 46, 22], [282, 282, 24, 44], [326, 334, 48, 22],
            [820, 258, 48, 22], [786, 294, 24, 48], [816, 354, 46, 22],
            [676, 250, 46, 22], [644, 282, 22, 44], [598, 334, 48, 22],
            # Lower lanes mirror the rhythm without copying the top geometry.
            [94, 472, 52, 22], [154, 500, 22, 48], [102, 566, 44, 22],
            [240, 458, 46, 22], [280, 490, 24, 44], [326, 542, 48, 22],
            [792, 470, 48, 22], [744, 502, 22, 46], [812, 560, 48, 22],
            [632, 466, 46, 22], [674, 496, 24, 46], [612, 548, 46, 22],
            # Small central islands create ricochet angles without sealing the map.
            [382, 300, 28, 20], [548, 318, 28, 20], [398, 420, 26, 20],
            [532, 430, 26, 20], [372, 206, 30, 20], [566, 214, 30, 20],
            # A short river-bank block preserves a clean ricochet angle and
            # keeps the long sightline from becoming completely open.
            [438, 278, 12, 22],
            # Keep the center fragments on the banks, never in the vertical
            # river channel, so the crossings remain readable and open.
            [400, 326, 24, 16], [540, 348, 24, 16], [350, 402, 24, 16],
        ],
        "props": [
            {"kind": "tree", "x": 74, "y": 108, "size": 42}, {"kind": "tree", "x": 120, "y": 180, "size": 38},
            {"kind": "tree", "x": 86, "y": 450, "size": 42}, {"kind": "tree", "x": 152, "y": 540, "size": 36},
            {"kind": "tree", "x": 875, "y": 126, "size": 40}, {"kind": "tree", "x": 822, "y": 500, "size": 44},
            {"kind": "tree", "x": 720, "y": 553, "size": 36}, {"kind": "tree", "x": 770, "y": 175, "size": 34},
            {"kind": "stump", "x": 235, "y": 220, "size": 20}, {"kind": "stump", "x": 711, "y": 406, "size": 22},
            {"kind": "stump", "x": 275, "y": 420, "size": 19}, {"kind": "stump", "x": 675, "y": 203, "size": 18},
            {"kind": "barrel", "x": 342, "y": 230, "size": 20}, {"kind": "barrel", "x": 614, "y": 414, "size": 20},
            {"kind": "stone", "x": 463, "y": 160, "size": 24}, {"kind": "stone", "x": 493, "y": 467, "size": 24},
            {"kind": "reed", "x": 420, "y": 176, "size": 28}, {"kind": "reed", "x": 548, "y": 244, "size": 24},
            {"kind": "reed", "x": 420, "y": 468, "size": 26}, {"kind": "reed", "x": 548, "y": 548, "size": 24},
            {"kind": "bush", "x": 178, "y": 246, "size": 30}, {"kind": "bush", "x": 786, "y": 430, "size": 32},
            {"kind": "pillar", "x": 204, "y": 130, "size": 28}, {"kind": "pillar", "x": 756, "y": 132, "size": 28},
            {"kind": "torch", "x": 398, "y": 184, "size": 22}, {"kind": "torch", "x": 562, "y": 184, "size": 22},
            {"kind": "banner", "x": 332, "y": 92, "size": 26}, {"kind": "banner", "x": 628, "y": 92, "size": 26},
            {"kind": "spikes", "x": 376, "y": 232, "size": 30}, {"kind": "spikes", "x": 584, "y": 232, "size": 30},
            {"kind": "bush", "x": 286, "y": 352, "size": 28}, {"kind": "bush", "x": 650, "y": 382, "size": 28},
            {"kind": "reed", "x": 402, "y": 340, "size": 24}, {"kind": "reed", "x": 558, "y": 352, "size": 24},
            {"kind": "torch", "x": 268, "y": 392, "size": 20}, {"kind": "torch", "x": 694, "y": 286, "size": 20},
        ],
        "pickup_points": [
            [140, 80, "lobber"], [480, 76, "flame"], [820, 80, "rotary"],
            [80, 320, "flare"], [880, 420, "prism"], [320, 260, "seeker"],
            [640, 240, "cursor"], [320, 360, "scatter"],
            [100, 560, "rapid_flare"], [480, 560, "rapid_lobber"], [760, 585, "healing_wave"],
            [320, 560, "energy_sniper"], [640, 80, "bug"],
        ],
        "support_points": [
            [205, 265, "health"], [755, 300, "health"],
            [480, 250, "armor"], [480, 550, "armor"],
        ],
    },
    "glass": {
        "name": "Sunvale Orchard", "accent": "#f2ca69", "ground": "#627044",
        "cover": [[56, 86, 86, 58], [818, 80, 88, 58], [254, 100, 68, 46],
                  [638, 96, 70, 46], [138, 236, 64, 40], [758, 234, 64, 40],
                  [292, 356, 74, 42], [594, 350, 74, 42], [62, 540, 90, 52],
                  [810, 538, 88, 52], [246, 548, 72, 46], [638, 546, 72, 46],
                  [416, 300, 58, 36], [500, 300, 58, 36], [392, 548, 56, 32],
                  [520, 548, 56, 32]],
        "obstacles": [
            # Upper orchard pockets: short walls and offset corners leave room
            # to rotate around the weapon spawns instead of forcing a grid path.
            [98, 88, 48, 22], [156, 112, 24, 48], [102, 176, 48, 22],
            [242, 96, 46, 22], [298, 126, 22, 44], [336, 178, 46, 22],
            [676, 94, 46, 22], [724, 124, 24, 46], [776, 174, 48, 22],
            [814, 94, 46, 22], [858, 126, 22, 44], [808, 178, 42, 22],
            # Above the river, staggered cover creates two wide approach lanes.
            [94, 244, 50, 22], [150, 276, 22, 46], [104, 336, 48, 22],
            [238, 220, 46, 22], [288, 250, 24, 44], [330, 304, 46, 22],
            [760, 220, 48, 22], [808, 252, 24, 44], [770, 306, 48, 22],
            [624, 244, 46, 22], [676, 274, 22, 44], [590, 322, 46, 22],
            [382, 196, 28, 20], [548, 206, 28, 20], [418, 330, 26, 20],
            [556, 332, 26, 20],
            # Lower bank cover lines up with bridge approaches but leaves the
            # three crossings open for fast rotations.
            [96, 532, 50, 22], [150, 562, 22, 46], [104, 606, 46, 22],
            [238, 522, 46, 22], [288, 552, 24, 44], [334, 596, 46, 22],
            [794, 528, 48, 22], [746, 558, 22, 46], [808, 602, 46, 22],
            [632, 522, 46, 22], [676, 552, 24, 44], [598, 596, 46, 22],
        ],
        "props": [
            {"kind": "tree", "x": 85, "y": 120, "size": 42}, {"kind": "tree", "x": 117, "y": 452, "size": 42},
            {"kind": "tree", "x": 847, "y": 120, "size": 42}, {"kind": "tree", "x": 844, "y": 508, "size": 42},
            {"kind": "tree", "x": 293, "y": 222, "size": 34}, {"kind": "tree", "x": 667, "y": 418, "size": 34},
            {"kind": "stump", "x": 345, "y": 200, "size": 20}, {"kind": "stump", "x": 621, "y": 436, "size": 20},
            {"kind": "barrel", "x": 254, "y": 430, "size": 18}, {"kind": "barrel", "x": 706, "y": 198, "size": 18},
            {"kind": "reed", "x": 190, "y": 424, "size": 26}, {"kind": "reed", "x": 370, "y": 526, "size": 24},
            {"kind": "reed", "x": 650, "y": 424, "size": 26}, {"kind": "reed", "x": 812, "y": 526, "size": 24},
            {"kind": "bush", "x": 188, "y": 168, "size": 30}, {"kind": "bush", "x": 770, "y": 566, "size": 30},
            {"kind": "crate", "x": 214, "y": 126, "size": 26}, {"kind": "crate", "x": 746, "y": 128, "size": 26},
            {"kind": "pillar", "x": 204, "y": 302, "size": 28}, {"kind": "pillar", "x": 758, "y": 304, "size": 28},
            {"kind": "torch", "x": 336, "y": 364, "size": 22}, {"kind": "torch", "x": 624, "y": 364, "size": 22},
            {"kind": "banner", "x": 350, "y": 98, "size": 26}, {"kind": "banner", "x": 620, "y": 98, "size": 26},
            {"kind": "spikes", "x": 300, "y": 382, "size": 30}, {"kind": "spikes", "x": 660, "y": 382, "size": 30},
            {"kind": "bush", "x": 190, "y": 286, "size": 28}, {"kind": "bush", "x": 770, "y": 288, "size": 28},
            {"kind": "reed", "x": 390, "y": 286, "size": 24}, {"kind": "reed", "x": 566, "y": 304, "size": 24},
            {"kind": "torch", "x": 430, "y": 356, "size": 20}, {"kind": "torch", "x": 530, "y": 356, "size": 20},
            {"kind": "banner", "x": 178, "y": 388, "size": 24}, {"kind": "banner", "x": 782, "y": 388, "size": 24},
        ],
        "pickup_points": [
            [84, 80, "lobber"], [300, 80, "flame"], [660, 80, "rotary"], [876, 80, "flare"],
            [80, 400, "prism"], [360, 250, "seeker"], [700, 240, "cursor"], [876, 400, "scatter"],
            [520, 350, "rapid_flare"], [360, 540, "rapid_lobber"],
            [740, 560, "healing_wave"], [200, 440, "energy_sniper"], [710, 440, "bug"],
        ],
        "support_points": [
            [205, 185, "health"], [755, 220, "health"],
            [205, 545, "armor"], [755, 545, "armor"],
        ],
    },
    "ember": {
        "name": "Redleaf Ruins", "accent": "#ef9a69", "ground": "#594938",
        "cover": [[294, 94, 94, 64], [574, 92, 94, 64], [294, 482, 94, 64],
                  [574, 478, 94, 64], [190, 176, 62, 40], [708, 174, 62, 40],
                  [190, 346, 62, 40], [708, 350, 62, 40], [400, 120, 48, 30],
                  [512, 488, 48, 30], [108, 292, 48, 28], [804, 292, 48, 28],
                  [384, 236, 50, 32], [526, 236, 50, 32], [384, 386, 50, 32],
                  [526, 386, 50, 32]],
        "obstacles": [
            # Ruined corner rooms are compact and asymmetrical, like the
            # cover clusters in Slay.one's arenas.
            [86, 88, 48, 22], [144, 116, 24, 48], [92, 178, 48, 22],
            [214, 102, 46, 22], [270, 134, 22, 44], [310, 184, 46, 22],
            [604, 88, 48, 22], [660, 118, 24, 46], [710, 174, 48, 22],
            [780, 100, 46, 22], [836, 132, 22, 44], [792, 188, 46, 22],
            # Upper middle lanes are deliberately offset from the river bridges.
            [92, 246, 50, 22], [148, 276, 22, 46], [98, 338, 48, 22],
            [218, 224, 46, 22], [274, 254, 24, 44], [318, 308, 46, 22],
            [610, 228, 48, 22], [668, 258, 22, 44], [712, 312, 48, 22],
            [798, 242, 46, 22], [850, 272, 22, 44], [808, 326, 46, 22],
            [350, 198, 30, 20], [580, 196, 30, 20], [402, 334, 26, 20],
            [532, 336, 26, 20],
            # Lower ruins create flanking positions without closing the three
            # bridge lanes across the horizontal river.
            [88, 496, 52, 22], [148, 526, 22, 46], [96, 584, 48, 22],
            [218, 504, 46, 22], [274, 534, 24, 44], [320, 588, 46, 22],
            [608, 494, 48, 22], [666, 524, 22, 46], [712, 582, 48, 22],
            [792, 490, 46, 22], [846, 522, 22, 44], [804, 580, 46, 22],
            [382, 492, 28, 20], [566, 488, 28, 20], [426, 566, 26, 20],
            [506, 566, 26, 20],
            # The lower fragment stays above the horizontal river bank.
            [430, 360, 24, 16], [506, 382, 24, 16], [462, 382, 24, 16],
        ],
        "props": [
            {"kind": "tree", "x": 68, "y": 220, "size": 42}, {"kind": "tree", "x": 890, "y": 412, "size": 40},
            {"kind": "tree", "x": 262, "y": 190, "size": 34}, {"kind": "tree", "x": 695, "y": 445, "size": 34},
            {"kind": "stump", "x": 368, "y": 213, "size": 20}, {"kind": "stump", "x": 590, "y": 430, "size": 20},
            {"kind": "stone", "x": 473, "y": 153, "size": 26}, {"kind": "stone", "x": 495, "y": 493, "size": 26},
            {"kind": "barrel", "x": 280, "y": 450, "size": 18}, {"kind": "barrel", "x": 680, "y": 185, "size": 18},
            {"kind": "reed", "x": 192, "y": 394, "size": 26}, {"kind": "reed", "x": 352, "y": 486, "size": 24},
            {"kind": "reed", "x": 624, "y": 394, "size": 26}, {"kind": "reed", "x": 798, "y": 486, "size": 24},
            {"kind": "bush", "x": 180, "y": 190, "size": 28}, {"kind": "bush", "x": 790, "y": 560, "size": 30},
            {"kind": "pillar", "x": 188, "y": 142, "size": 28}, {"kind": "pillar", "x": 760, "y": 142, "size": 28},
            {"kind": "crate", "x": 218, "y": 184, "size": 26}, {"kind": "crate", "x": 742, "y": 184, "size": 26},
            {"kind": "torch", "x": 344, "y": 188, "size": 22}, {"kind": "torch", "x": 616, "y": 188, "size": 22},
            {"kind": "banner", "x": 336, "y": 98, "size": 26}, {"kind": "banner", "x": 626, "y": 98, "size": 26},
            {"kind": "spikes", "x": 378, "y": 372, "size": 30}, {"kind": "spikes", "x": 580, "y": 372, "size": 30},
            {"kind": "bush", "x": 188, "y": 352, "size": 28}, {"kind": "bush", "x": 770, "y": 328, "size": 28},
            {"kind": "reed", "x": 420, "y": 286, "size": 24}, {"kind": "reed", "x": 540, "y": 306, "size": 24},
            {"kind": "torch", "x": 312, "y": 348, "size": 20}, {"kind": "torch", "x": 648, "y": 348, "size": 20},
            {"kind": "banner", "x": 410, "y": 178, "size": 24}, {"kind": "banner", "x": 550, "y": 178, "size": 24},
        ],
        "pickup_points": [
            [80, 80, "lobber"], [480, 80, "flame"], [880, 80, "rotary"], [80, 320, "flare"],
            [880, 320, "prism"], [80, 560, "seeker"], [480, 560, "cursor"], [880, 560, "scatter"],
            [680, 220, "rapid_flare"], [268, 420, "rapid_lobber"],
            [680, 420, "healing_wave"], [380, 240, "energy_sniper"], [580, 400, "bug"],
        ],
        "support_points": [
            [190, 250, "health"], [770, 250, "health"],
            [190, 525, "armor"], [770, 525, "armor"],
        ],
    },
}


# Water is impassable on foot; bridge rectangles are the walkable crossings.
# Coordinates are kept in the original 960x640 design space and scaled with
# the rest of each arena below.
MAPS["tidal"].update({
    "water": [[454, 18, 62, 212], [454, 278, 62, 250], [454, 576, 62, 46]],
    "bridges": [[435, 54, 90, 48], [435, 224, 90, 56], [435, 518, 90, 58]],
    "portals": [
        {"id": "tidal-west-gate", "pair": "tidal-east-gate", "x": 218, "y": 445, "radius": 6},
        {"id": "tidal-east-gate", "pair": "tidal-west-gate", "x": 742, "y": 445, "radius": 6},
    ],
})
MAPS["glass"].update({
    "water": [[26, 438, 904, 76]],
    "bridges": [[172, 398, 56, 96], [522, 398, 56, 96], [682, 398, 56, 96]],
    "portals": [
        {"id": "glass-north-gate", "pair": "glass-south-gate", "x": 480, "y": 250, "radius": 6},
        {"id": "glass-south-gate", "pair": "glass-north-gate", "x": 480, "y": 570, "radius": 6},
    ],
})
MAPS["ember"].update({
    "water": [[26, 408, 908, 70]],
    "bridges": [[231, 394, 48, 98], [470, 394, 48, 98], [651, 394, 48, 98]],
    "portals": [
        {"id": "ember-north-gate", "pair": "ember-south-gate", "x": 480, "y": 250, "radius": 6},
        {"id": "ember-south-gate", "pair": "ember-north-gate", "x": 480, "y": 550, "radius": 6},
    ],
})


def _fragment_cover_geometry(rectangles):
    """Turn broad grass regions into several separated visual/concealment patches."""
    fragments = []
    for index, (x, y, width, height) in enumerate(rectangles):
        if width < 70 or height < 36:
            fragments.append([x, y, width, height])
            continue
        gap_x = max(8, round(width * .12))
        gap_y = max(7, round(height * .14))
        half_width = max(18, round((width - gap_x) / 2))
        half_height = max(14, round((height - gap_y) / 2))
        candidates = [
            [x, y, half_width, half_height],
            [x + width - half_width, y + 2, half_width, half_height - 2],
            [x + 3, y + height - half_height, half_width - 3, half_height],
            [x + width - half_width - 2, y + height - half_height - 2,
             half_width, half_height - 1],
        ]
        # Leave a few irregular openings so each region reads as a cluster.
        if index % 3 == 1:
            candidates.pop(1)
        if index % 4 == 2:
            candidates.pop(2)
        fragments.extend([patch for patch in candidates if patch[2] >= 14 and patch[3] >= 12])
    return fragments


def _fragment_obstacle_geometry(rectangles):
    """Break long walls into short cover-like chunks with deliberate gaps."""
    fragments = []
    for index, (x, y, width, height) in enumerate(rectangles):
        if width <= 55 and height <= 55:
            fragments.append([x, y, width, height])
            continue
        if width >= height * 1.8:
            count = 3 if width >= 120 else 2
            gap = max(6, round(min(width, height) * .28))
            chunk = (width - gap * (count - 1)) / count
            for part in range(count):
                offset_y = ((index + part) % 3 - 1) * 3
                fragments.append([
                    round(x + part * (chunk + gap)), round(y + max(0, offset_y)),
                    round(chunk), round(max(14, height - abs(offset_y))),
                ])
            continue
        if height >= width * 1.8:
            count = 3 if height >= 120 else 2
            gap = max(6, round(min(width, height) * .28))
            chunk = (height - gap * (count - 1)) / count
            for part in range(count):
                offset_x = ((index + part) % 3 - 1) * 3
                fragments.append([
                    round(x + max(0, offset_x)), round(y + part * (chunk + gap)),
                    round(max(14, width - abs(offset_x))), round(chunk),
                ])
            continue
        # Near-square structures become a staggered three-block ruin.
        gap = max(6, round(min(width, height) * .18))
        half_width = max(16, round((width - gap) / 2))
        half_height = max(14, round((height - gap) / 2))
        fragments.extend([
            [x, y, half_width, half_height],
            [x + width - half_width, y + 2, half_width, half_height - 2],
            [x + round(width * .22), y + height - half_height, round(width * .56), half_height],
        ])
    return [fragment for fragment in fragments if fragment[2] >= 12 and fragment[3] >= 12]


NAVIGATION_RADIUS = 16.0
MIN_OBSTACLE_SPAN = 18
MIN_WALKABLE_GAP = NAVIGATION_RADIUS * 2 + 4
PROP_NAVIGATION_PADDING = NAVIGATION_RADIUS * 2 + 4
BLOCKING_PROP_KINDS = frozenset({"tree", "stump", "barrel", "stone", "pillar", "crate"})


def _trim_obstacle_overlaps(rectangles):
    """Remove rectangle intersections without creating tiny sliver walls.

    The hand-authored layouts deliberately use L-shaped clusters. Rounding the
    960px design coordinates to the 3000px world can make two neighbouring
    chunks overlap by a few pixels, though. Keep the larger side of each
    intersection so the visual cluster stays intact while collision geometry
    remains unambiguous.
    """
    cleaned = [list(map(int, rectangle)) for rectangle in rectangles]
    for _ in range(max(4, len(cleaned) * 2)):
        changed = False
        for left_index in range(len(cleaned)):
            x, y, width, height = cleaned[left_index]
            for right_index in range(left_index + 1, len(cleaned)):
                other_x, other_y, other_width, other_height = cleaned[right_index]
                overlap_left = max(x, other_x)
                overlap_top = max(y, other_y)
                overlap_right = min(x + width, other_x + other_width)
                overlap_bottom = min(y + height, other_y + other_height)
                if overlap_left >= overlap_right or overlap_top >= overlap_bottom:
                    continue

                candidates = []
                if overlap_left - other_x >= MIN_OBSTACLE_SPAN:
                    candidates.append([other_x, other_y, overlap_left - other_x, other_height])
                if other_x + other_width - overlap_right >= MIN_OBSTACLE_SPAN:
                    candidates.append([overlap_right, other_y,
                                       other_x + other_width - overlap_right, other_height])
                if overlap_top - other_y >= MIN_OBSTACLE_SPAN:
                    candidates.append([other_x, other_y, other_width, overlap_top - other_y])
                if other_y + other_height - overlap_bottom >= MIN_OBSTACLE_SPAN:
                    candidates.append([other_x, overlap_bottom, other_width,
                                       other_y + other_height - overlap_bottom])
                if candidates:
                    cleaned[right_index] = max(
                        candidates, key=lambda item: item[2] * item[3])
                else:
                    # A completely covered sliver cannot be a useful wall.
                    cleaned.pop(right_index)
                changed = True
                break
            if changed:
                break
        if not changed:
            break
    return [rectangle for rectangle in cleaned
            if rectangle[2] >= MIN_OBSTACLE_SPAN and rectangle[3] >= MIN_OBSTACLE_SPAN]


def _close_tight_obstacle_gaps(rectangles):
    """Join every sub-character-width gap into the surrounding wall cluster.

    Slay-style cover is built from short blocks, but diagonal corners must not
    leave a tempting-looking slot that is narrower than the player's collision
    circle.  Treat the Euclidean corner distance as the clearance too.  When a
    gap is too small, extend the earlier block along each separating axis until
    the two blocks touch.  The overlap trimmer runs after each extension, so the
    resulting collision rectangles remain disjoint while the visual cluster is
    intentionally welded together.
    """
    closed = [list(rectangle) for rectangle in rectangles]
    for _ in range(max(2, len(closed))):
        changed = False
        for left_index in range(len(closed)):
            x, y, width, height = closed[left_index]
            for right_index in range(left_index + 1, len(closed)):
                other_x, other_y, other_width, other_height = closed[right_index]
                horizontal_gap = max(other_x - (x + width), x - (other_x + other_width), 0)
                vertical_gap = max(other_y - (y + height), y - (other_y + other_height), 0)
                clearance = math.hypot(horizontal_gap, vertical_gap)
                if 0 < clearance < MIN_WALKABLE_GAP:
                    # Extend the rectangle that appears first in the authored
                    # order toward the later rectangle.  This preserves the
                    # hand-placed rhythm while welding only the tiny gap.
                    if other_x > x + width:
                        closed[left_index][2] = other_x - x
                    elif x > other_x + other_width:
                        closed[right_index][2] = x - other_x
                    if other_y > y + height:
                        closed[left_index][3] = other_y - y
                    elif y > other_y + other_height:
                        closed[right_index][3] = y - other_y
                    changed = True
                if changed:
                    break
            if changed:
                break
        if not changed:
            break
        closed = _trim_obstacle_overlaps(closed)
    return closed


def _circle_to_rectangle_distance(x, y, radius, rectangle):
    rx, ry, width, height = rectangle
    nearest_x = max(rx, min(x, rx + width))
    nearest_y = max(ry, min(y, ry + height))
    return math.hypot(x - nearest_x, y - nearest_y) - radius


def _geometry_in_water(map_def, x, y, radius):
    for water in map_def.get("water", ()):
        wx, wy, width, height = water
        inside_water = x + radius > wx and x - radius < wx + width and \
            y + radius > wy and y - radius < wy + height
        if not inside_water:
            continue
        # A bridge is walkable only while the player's collision footprint is
        # fully supported by it.  Merely touching a bridge used to let a
        # player slide into the river along its edge.
        if any(x - radius >= bx and x + radius <= bx + bw and
               y - radius >= by and y + radius <= by + bh
               for bx, by, bw, bh in map_def.get("bridges", ())):
            continue
        return True
    return False


def _blocking_prop_position_clear(map_def, prop, x, y, other_props):
    prop_radius = prop["size"] * .34
    if x < prop_radius + 18 or x > WIDTH - prop_radius - 18 or \
            y < prop_radius + 18 or y > HEIGHT - prop_radius - 18:
        return False
    if _geometry_in_water(map_def, x, y, prop_radius + NAVIGATION_RADIUS):
        return False
    pickup_points = tuple(map_def.get("pickup_points", ())) + tuple(map_def.get("support_points", ()))
    if any(math.hypot(x - pickup_x, y - pickup_y) < prop_radius + NAVIGATION_RADIUS * 2
           for pickup_x, pickup_y, _ in pickup_points):
        return False
    if any(_circle_to_rectangle_distance(x, y, prop_radius + PROP_NAVIGATION_PADDING, obstacle) < 0
           for obstacle in map_def.get("obstacles", ())):
        return False
    for other in other_props:
        if other is prop or other["kind"] not in BLOCKING_PROP_KINDS:
            continue
        other_radius = other["size"] * .34
        if math.hypot(x - other["x"], y - other["y"]) < prop_radius + other_radius + 4:
            return False
    return True


def _nudge_blocking_props(map_def):
    """Move decorative solid props clear of walls while preserving landmarks."""
    props = map_def.get("props", ())
    for prop in props:
        if prop["kind"] not in BLOCKING_PROP_KINDS:
            continue
        original_x, original_y = prop["x"], prop["y"]
        step = 24
        offsets = [(0, 0)]
        for distance in (step, step * 2, step * 3, step * 4, step * 5,
                         step * 6, step * 7, step * 8, step * 9, step * 10):
            offsets.extend((dx, dy) for dx, dy in (
                (-distance, 0), (distance, 0), (0, -distance), (0, distance),
                (-distance, -distance), (distance, -distance),
                (-distance, distance), (distance, distance)))
        offsets.sort(key=lambda offset: (offset[0] * offset[0] + offset[1] * offset[1], offset[1], offset[0]))
        for offset_x, offset_y in offsets:
            candidate_x, candidate_y = original_x + offset_x, original_y + offset_y
            if _blocking_prop_position_clear(map_def, prop, candidate_x, candidate_y, props):
                prop["x"], prop["y"] = round(candidate_x), round(candidate_y)
                break


def _assert_map_geometry():
    """Fail fast if a future map edit breaks collision or passage invariants."""
    for map_id, map_def in MAPS.items():
        obstacles = map_def.get("obstacles", ())
        for index, (x, y, width, height) in enumerate(obstacles):
            for other_x, other_y, other_width, other_height in obstacles[index + 1:]:
                overlap_width = min(x + width, other_x + other_width) - max(x, other_x)
                overlap_height = min(y + height, other_y + other_height) - max(y, other_y)
                if overlap_width > 0 and overlap_height > 0:
                    raise ValueError(f"{map_id} has overlapping obstacles")
                vertical_overlap = max(0, overlap_height)
                horizontal_overlap = max(0, overlap_width)
                if vertical_overlap >= NAVIGATION_RADIUS * 2:
                    horizontal_gap = min(abs(other_x - (x + width)),
                                         abs(x - (other_x + other_width)))
                    if 0 < horizontal_gap < MIN_WALKABLE_GAP:
                        raise ValueError(f"{map_id} has a narrow horizontal passage")
                if horizontal_overlap >= NAVIGATION_RADIUS * 2:
                    vertical_gap = min(abs(other_y - (y + height)),
                                       abs(y - (other_y + other_height)))
                    if 0 < vertical_gap < MIN_WALKABLE_GAP:
                        raise ValueError(f"{map_id} has a narrow vertical passage")

        solids = [prop for prop in map_def.get("props", ())
                  if prop["kind"] in BLOCKING_PROP_KINDS]
        for index, prop in enumerate(solids):
            prop_radius = prop["size"] * .34
            if any(_circle_to_rectangle_distance(prop["x"], prop["y"],
                                                  prop_radius + PROP_NAVIGATION_PADDING,
                                                  obstacle) < 0
                   for obstacle in obstacles):
                raise ValueError(f"{map_id} has a prop inside an obstacle")
            for other in solids[index + 1:]:
                other_radius = other["size"] * .34
                if math.hypot(prop["x"] - other["x"], prop["y"] - other["y"]) < \
                        prop_radius + other_radius:
                    raise ValueError(f"{map_id} has overlapping props")

        portals = map_def.get("portals", ())
        portal_ids = {portal.get("id") for portal in portals}
        if len(portal_ids) != len(portals) or None in portal_ids:
            raise ValueError(f"{map_id} has duplicate or missing portal ids")
        for portal in portals:
            pair_id = portal.get("pair")
            pair = next((candidate for candidate in portals if candidate.get("id") == pair_id), None)
            if pair is None or pair.get("pair") != portal.get("id"):
                raise ValueError(f"{map_id} has an unpaired portal")
            if portal.get("radius", 0) <= 0:
                raise ValueError(f"{map_id} has an invalid portal radius")
            blocked_obstacle = next((obstacle for obstacle in obstacles
                                     if _circle_to_rectangle_distance(
                                         portal["x"], portal["y"], portal["radius"], obstacle) < 0), None)
            if _geometry_in_water(map_def, portal["x"], portal["y"], portal["radius"]) or blocked_obstacle:
                raise ValueError(f"{map_id} has portal {portal['id']} inside solid geometry {blocked_obstacle}")


def _scale_map_geometry():
    """Scale the original layout into the larger world once at import time."""
    for map_def in MAPS.values():
        map_def["obstacles"] = _fragment_obstacle_geometry(map_def["obstacles"])
        map_def["obstacles"] = [
            [round(value * MAP_SCALE) for value in obstacle]
            for obstacle in map_def["obstacles"]
        ]
        map_def["cover"] = _fragment_cover_geometry(map_def["cover"])
        map_def["cover"] = [
            [round(value * MAP_SCALE) for value in cover]
            for cover in map_def["cover"]
        ]
        for key in ("water", "bridges"):
            map_def[key] = [
                [round(value * MAP_SCALE) for value in region]
                for region in map_def.get(key, ())
            ]
        for prop in map_def.get("props", ()):
            for key in ("x", "y", "size"):
                prop[key] = round(prop[key] * MAP_SCALE)
        map_def["pickup_points"] = [
            [round(x * MAP_SCALE), round(y * MAP_SCALE), weapon]
            for x, y, weapon in map_def["pickup_points"]
        ]
        map_def["support_points"] = [
            [round(x * MAP_SCALE), round(y * MAP_SCALE), resource]
            for x, y, resource in map_def.get("support_points", ())
        ]
        for portal in map_def.get("portals", ()):
            portal["x"] = round(portal["x"] * MAP_SCALE)
            portal["y"] = round(portal["y"] * MAP_SCALE)
            portal["radius"] = round(portal["radius"] * MAP_SCALE)
        map_def["obstacles"] = _close_tight_obstacle_gaps(map_def["obstacles"])
        map_def["obstacles"] = _trim_obstacle_overlaps(map_def["obstacles"])
        _nudge_blocking_props(map_def)


_scale_map_geometry()
_assert_map_geometry()

# Fifteen original visual designs mapped to the publicly visible weapon slots.
# Numeric fields mirror the official public client configuration where exposed.
# The local arena uses seconds and pixels: ticks / 20, field units * 30 px.
WEAPONS = {
    "pulse": {"name": "Pulse Needle", "slot": "1", "kind": "bolt", "cooldown": 17 / 20,
              "damage": 28, "speed": .75 * 20 * FIELD_UNIT_PX, "life": 60 / 20,
              "color": "#55e7d1", "spread": 0,
              "clip": -1, "reserve": -1, "pickup": 0, "ammo_size": 999999, "reload": 0},
    "lobber": {"name": "Cinder Arc", "slot": "2", "kind": "arc", "cooldown": 4 / 20,
               "damage": 55, "speed": .5 * 20 * FIELD_UNIT_PX, "life": 9.5 * FIELD_UNIT_PX / 300,
               "range": 9.5 * FIELD_UNIT_PX, "blast": 2.1 * FIELD_UNIT_PX,
               "color": "#ffb45e", "spread": 0, "clip": 1, "reserve": 8,
               "pickup": 8, "ammo_size": 8, "reload": 55 / 20, "movement_modifier": 1.03},
    "flame": {"name": "Ember Reach", "slot": "3", "kind": "flame", "cooldown": 2 / 20,
              "damage": 4, "speed": .45 * 20 * FIELD_UNIT_PX, "life": 16 / 20,
              "color": "#f47b45", "spread": 0,
              "clip": 50, "reserve": 100, "pickup": 100, "ammo_size": 100,
              "reload": 60 / 20, "movement_modifier": 1.13},
    "rotary": {"name": "Thorn Wheel", "slot": "4", "kind": "bolt", "cooldown": 2 / 20,
               "damage": 5.55, "speed": 3 * 20 * FIELD_UNIT_PX, "life": 20 / 20,
               "color": "#a5ef86", "spread": .03 * math.pi,
               "clip": 50, "reserve": 100, "pickup": 100, "ammo_size": 100, "reload": 3.0},
    "flare": {"name": "Comet Driver", "slot": "5", "kind": "rocket", "cooldown": 4 / 20,
              "damage": 60, "speed": .6 * 20 * FIELD_UNIT_PX, "life": 130 / 20,
              "blast": 2.3 * FIELD_UNIT_PX,
              "color": "#ff795f", "spread": 0, "clip": 1, "reserve": 8, "pickup": 8, "ammo_size": 8, "reload": 2.75},
    "prism": {"name": "Prism Thread", "slot": "6", "kind": "ricochet", "cooldown": 17 / 20,
              "damage": 28, "speed": .75 * 20 * FIELD_UNIT_PX, "life": 100 / 20, "bounces": 8,
              "color": "#a58cff", "spread": 0, "clip": 999999, "reserve": 20,
              "pickup": 20, "ammo_size": 20, "reload": 20 / 20},
    "seeker": {"name": "Morrow Seeker", "slot": "7", "kind": "seeker", "cooldown": 4 / 20,
               "damage": 50, "speed": .36 * 20 * FIELD_UNIT_PX, "life": 250 / 20,
               "blast": 1.9 * FIELD_UNIT_PX, "turn": .16 * 20,
               "color": "#f0d15f", "spread": 0, "clip": 1, "reserve": 7,
               "pickup": 7, "ammo_size": 7, "reload": 70 / 20, "movement_modifier": .9},
    "cursor": {"name": "Wayfinder", "slot": "8", "kind": "cursor", "cooldown": 4 / 20,
               "damage": 58, "speed": .39 * 20 * FIELD_UNIT_PX, "life": 250 / 20,
               "blast": 1.9 * FIELD_UNIT_PX, "turn": .2 * 20,
               "color": "#6fcaff", "spread": 0, "clip": 1, "reserve": 7,
               "pickup": 7, "ammo_size": 7, "reload": 70 / 20, "movement_modifier": .95},
    "scatter": {"name": "Shard Bloom", "slot": "0", "kind": "scatter", "cooldown": 22 / 20,
                "damage": 6, "speed": 3 * 20 * FIELD_UNIT_PX, "life": 20 / 20,
                "projectiles": 7,
                "color": "#f5d37a", "spread": .09 * math.pi, "clip": 5,
                "reserve": 10, "pickup": 10, "ammo_size": 10, "reload": 55 / 20,
                "falloff": .15, "movement_modifier": 1.05},
    "rapid_flare": {"name": "Comet Swarm", "slot": "N", "kind": "rocket", "cooldown": 15 / 20,
                    "damage": 42, "speed": .6 * 20 * FIELD_UNIT_PX, "life": 130 / 20,
                    "blast": 1.45 * FIELD_UNIT_PX, "color": "#ff9863", "spread": 0,
                    "clip": 8, "reserve": 16, "pickup": 16, "ammo_size": 16,
                    "reload": 60 / 20, "movement_modifier": 1.05},
    "rapid_lobber": {"name": "Cinder Rain", "slot": "M", "kind": "arc", "cooldown": 18 / 20,
                     "damage": 42, "speed": .5 * 20 * FIELD_UNIT_PX,
                     "life": 9.5 * FIELD_UNIT_PX / 300, "range": 9.5 * FIELD_UNIT_PX,
                     "blast": 1.5 * FIELD_UNIT_PX, "color": "#ffc778", "spread": 0,
                     "clip": 8, "reserve": 16, "pickup": 16, "ammo_size": 16,
                     "reload": 60 / 20, "movement_modifier": 1.05},
    "healing_wave": {"name": "Heartroot Beam", "slot": "H", "kind": "heal_beam", "cooldown": 5 / 20,
                     "damage": 5, "self_heal": 3.75, "auto_aim_range": 3 * FIELD_UNIT_PX,
                     "speed": 10.5 * 20 * FIELD_UNIT_PX, "size": .01 * FIELD_UNIT_PX,
                     "life": 5 / 20, "color": "#77e0b0", "spread": 0,
                     "clip": 40, "reserve": 100, "pickup": 100, "ammo_size": 100,
                     "reload": 60 / 20, "movement_modifier": 1.15},
    "energy_sniper": {"name": "Aurora Lance", "slot": "J", "kind": "energy_ray", "cooldown": 20 / 20,
                      "damage": 20, "speed": 3 * 20 * FIELD_UNIT_PX, "size": .2 * FIELD_UNIT_PX,
                      "life": 8 / 20, "color": "#ee6a72", "spread": 0,
                      "clip": 14, "reserve": 28, "pickup": 28, "ammo_size": 28,
                      "reload": 60 / 20,
                      "alternate": {"kind": "energy_orb", "cooldown": 20 / 20,
                                    "damage": 45, "combo_damage": 100,
                                    "speed": .35 * 20 * FIELD_UNIT_PX, "size": .28 * FIELD_UNIT_PX,
                                    "life": 100 / 20, "blast": 1.4 * FIELD_UNIT_PX,
                                    "combo_blast": 3.1 * FIELD_UNIT_PX}},
    "bug": {"name": "Mite Bloom", "slot": "L", "kind": "bug", "cooldown": 3.5 / 20,
            "damage": 50, "speed": .45 * 20 * FIELD_UNIT_PX, "life": 250 / 20,
            "blast": 2.1 * FIELD_UNIT_PX, "range": 9.5 * FIELD_UNIT_PX,
            "turn": 2.4, "color": "#e98bb5", "spread": 0,
            "clip": 1, "reserve": 6, "pickup": 6, "ammo_size": 6,
            "reload": 65 / 20, "movement_modifier": .975},
}
UPGRADES = {"vitality", "velocity", "amplify"}
RESOURCE_ITEMS = {
    "health": {"name": "Field Medkit", "label": "血包", "amount": 35, "color": "#e66f70"},
    "armor": {"name": "Bark Armor", "label": "护甲", "amount": 40, "color": "#73b9cf"},
}
MODES = {
    "normal": {"name": "Normal Deathmatch", "teams": False, "flags": False, "zombies": False},
    "zombie_dm": {"name": "Zombie Deathmatch", "teams": False, "flags": False, "zombies": True},
    "team_dm": {"name": "Team Deathmatch", "teams": True, "flags": False, "zombies": False},
    "ctf": {"name": "Capture the Flag", "teams": True, "flags": True, "zombies": False},
    "duel": {"name": "Ranked 1v1", "teams": False, "flags": False, "zombies": False},
    "zombie_coop": {"name": "Zombie Coop", "teams": True, "flags": False, "zombies": True},
}
PLAYER_COLORS = ["#73e5ce", "#f38b67", "#c49aff", "#e9c56d", "#83b7f7",
                 "#e58db1", "#a8d878", "#ef977e", "#80d2df", "#d5a4ea"]
PLAYER_SKINS = {"wayfinder", "orchard", "ember", "gear"}
@dataclass
class Player:
    id: str
    name: str
    x: float
    y: float
    hue: str
    skin: str = "wayfinder"
    hp: int = 100
    armor: int = 0
    energy: float = START_ENERGY
    weapon: str = "pulse"
    owned_weapons: set = field(default_factory=lambda: {"pulse"})
    upgrades: dict = field(default_factory=lambda: {"vitality": 0, "velocity": 0, "amplify": 0})
    ammo: dict = field(default_factory=dict)
    score: int = 0
    kills: int = 0
    deaths: int = 0
    is_bot: bool = False
    team: int = 0
    is_zombie: bool = False
    lives: int = 5
    captures: int = 0
    souls: int = 0
    carried_flag: int | None = None
    move_x: float = 0
    move_y: float = 0
    aim_x: float = WIDTH / 2
    aim_y: float = HEIGHT / 2
    firing: bool = False
    aiming: bool = False
    alternate_fire: bool = False
    last_input: float = field(default_factory=time.monotonic)
    last_shot: float = -999
    aim_started: float = 0
    dash_x: float = 0
    dash_y: float = 0
    dash_until: float = 0
    knockback_x: float = 0
    knockback_y: float = 0
    knockback_until: float = 0
    knockback_source: str | None = None
    jump_until: float = 0
    next_dash: float = 0
    shield_until: float = 0
    next_shield: float = 0
    next_repair: float = 0
    bot_next_think: float = 0
    cover_exposed_until: float = 0
    dead_until: float = 0
    invincible_until: float = field(default_factory=lambda: time.monotonic() + SPAWN_INVINCIBILITY)
    switch_until: float = 0
    portal_cooldown_until: float = 0

    def __post_init__(self):
        if self.is_bot:
            self.owned_weapons = set(WEAPONS)
        for key, weapon in WEAPONS.items():
            if weapon["clip"] < 0:
                self.ammo[key] = {"mag": -1, "reserve": -1, "reload_until": 0}
            else:
                # Reference behavior starts with only the basic laser. Other
                # weapons become available after their map pickup; ammo is not
                # capped by an artificial loadout size.
                if self.is_bot:
                    self.ammo[key] = {"mag": weapon["clip"], "reserve": -1, "reload_until": 0}
                elif key in self.owned_weapons:
                    self.ammo[key] = {"mag": weapon["clip"], "reserve": -1, "reload_until": 0}
                else:
                    self.ammo[key] = {"mag": 0, "reserve": 0, "reload_until": 0}


@dataclass
class Room:
    code: str
    map_id: str
    mode: str = "normal"
    players: dict = field(default_factory=dict)
    sockets: dict = field(default_factory=dict)
    spectator_sockets: dict = field(default_factory=dict)
    projectiles: list = field(default_factory=list)
    pickups: list = field(default_factory=list)
    resources: list = field(default_factory=list)
    flags: dict = field(default_factory=dict)
    team_scores: dict = field(default_factory=lambda: {"0": 0, "1": 0})
    feed: list = field(default_factory=list)
    winner: str | None = None
    map_votes: dict = field(default_factory=dict)
    map_vote_deadline: float = 0
    started_at: float = field(default_factory=time.monotonic)
    created: float = field(default_factory=time.time)
    task: asyncio.Task | None = None
    next_id: int = 0
    last_private_broadcast: float = 0
    public_roster_signature: tuple | None = None
    tick_profile_samples: list = field(default_factory=list, repr=False)


rooms: dict[str, Room] = {}
rooms_lock = asyncio.Lock()
lobby_sockets: set[WebSocket] = set()
lobby_messages = deque(maxlen=30)
lobby_message_id = 0
LOBBY_CHAT_INTERVAL = 1.0


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def in_cover(map_id: str, x: float, y: float):
    # This runs once per player in every state snapshot. Avoid allocating a
    # generator for the common miss path while preserving the same rectangle
    # semantics used by concealment and line-of-sight checks.
    for cx, cy, width, height in MAPS[map_id]["cover"]:
        if cx <= x <= cx + width and cy <= y <= cy + height:
            return True
    return False


def cover_index(map_id: str, x: float, y: float):
    """Return the grass patch containing a point, or ``None`` outside cover."""
    for index, (cx, cy, width, height) in enumerate(MAPS[map_id]["cover"]):
        if cx <= x <= cx + width and cy <= y <= cy + height:
            return index
    return None


def _player_concealed(player: Player, map_id: str, viewer_id: str | None,
                      viewer: Player | None, now: float):
    if not in_cover(map_id, player.x, player.y) or player.id == viewer_id:
        return False
    # Firing or taking damage briefly breaks the grass concealment. The
    # timestamp lives on the server so every client sees the same reveal.
    if player.cover_exposed_until > now:
        return False
    if viewer and cover_index(map_id, viewer.x, viewer.y) == cover_index(map_id, player.x, player.y):
        return False
    return True


def _inside_region(x: float, y: float, region, radius: float = 0):
    rx, ry, width, height = region
    return x + radius > rx and x - radius < rx + width and \
        y + radius > ry and y - radius < ry + height


def in_water(map_id: str, x: float, y: float, radius: float = 0):
    """Return true when a player footprint is in river water rather than on a bridge."""
    water_regions = MAPS[map_id].get("water", ())
    bridges = MAPS[map_id].get("bridges", ())
    return any(_inside_region(x, y, water, radius) and
               not any(x - radius >= bridge[0] and
                       x + radius <= bridge[0] + bridge[2] and
                       y - radius >= bridge[1] and
                       y + radius <= bridge[1] + bridge[3]
                       for bridge in bridges)
               for water in water_regions)


def collides(map_id: str, x: float, y: float, radius: float = 16, *, include_water=True):
    if x < radius + 18 or x > WIDTH - radius - 18 or y < radius + 18 or y > HEIGHT - radius - 18:
        return True
    if include_water and in_water(map_id, x, y, radius):
        return True
    if any(x + radius > ox and x - radius < ox + width and
           y + radius > oy and y - radius < oy + height
           for ox, oy, width, height in MAPS[map_id]["obstacles"]):
        return True
    return any(math.hypot(x - prop["x"], y - prop["y"]) < radius + prop["size"] * .34
               for prop in MAPS[map_id].get("props", ())
               if prop["kind"] in BLOCKING_PROP_KINDS)


def _portal_at(map_id: str, x: float, y: float, radius: float = 0, *, ignored_id=None):
    for portal in MAPS[map_id].get("portals", ()):
        if portal.get("id") == ignored_id:
            continue
        if math.hypot(x - portal["x"], y - portal["y"]) <= portal["radius"] + radius:
            return portal
    return None


def _portal_pair(map_id: str, portal: dict):
    return next((candidate for candidate in MAPS[map_id].get("portals", ())
                 if candidate.get("id") == portal.get("pair")), None)


def _portal_exit(map_id: str, portal: dict, dx: float, dy: float, radius: float):
    pair = _portal_pair(map_id, portal)
    if not pair:
        return None
    length = math.hypot(dx, dy)
    if length < .001:
        dx, dy = pair["x"] - portal["x"], pair["y"] - portal["y"]
        length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length
    offsets = (pair["radius"] + radius + PORTAL_EXIT_PADDING,
               pair["radius"] + radius + PORTAL_EXIT_PADDING + 18,
               pair["radius"] + radius + PORTAL_EXIT_PADDING + 36)
    for offset in offsets:
        x, y = pair["x"] + ux * offset, pair["y"] + uy * offset
        if not collides(map_id, x, y, radius):
            return x, y
    if not collides(map_id, pair["x"], pair["y"], radius):
        return pair["x"], pair["y"]
    return None


def _maybe_teleport_player(room: Room, player: Player, now: float):
    if now < player.portal_cooldown_until:
        return False
    portal = _portal_at(room.map_id, player.x, player.y, 15)
    if not portal:
        return False
    if player.knockback_until > now and math.hypot(player.knockback_x, player.knockback_y) > .1:
        dx, dy = player.knockback_x, player.knockback_y
    elif math.hypot(player.move_x, player.move_y) > .01:
        dx, dy = player.move_x, player.move_y
    else:
        dx, dy = player.aim_x - player.x, player.aim_y - player.y
    exit_point = _portal_exit(room.map_id, portal, dx, dy, 15)
    if not exit_point:
        return False
    player.x, player.y = exit_point
    player.portal_cooldown_until = now + PLAYER_PORTAL_COOLDOWN_SECONDS
    return True


def _maybe_teleport_projectile(room: Room, projectile: dict, old_x: float, old_y: float,
                               now: float):
    portal = _portal_at(room.map_id, projectile["x"], projectile["y"], projectile.get("r", 4))
    if not portal or _portal_at(room.map_id, old_x, old_y, projectile.get("r", 4)) is portal:
        return False
    exit_point = _portal_exit(room.map_id, portal, projectile.get("vx", 0), projectile.get("vy", 0),
                              projectile.get("r", 4))
    if not exit_point:
        return False
    projectile["x"], projectile["y"] = exit_point
    return True


def has_line_of_sight(map_id: str, x1: float, y1: float, x2: float, y2: float):
    dx, dy = x2 - x1, y2 - y1
    for ox, oy, width, height in MAPS[map_id]["obstacles"]:
        low, high = 0.0, 1.0
        for origin, delta, minimum, maximum in (
                (x1, dx, ox - 2, ox + width + 2),
                (y1, dy, oy - 2, oy + height + 2)):
            if abs(delta) < 1e-9:
                if origin < minimum or origin > maximum:
                    break
                continue
            enter, leave = (minimum - origin) / delta, (maximum - origin) / delta
            if enter > leave:
                enter, leave = leave, enter
            low, high = max(low, enter), min(high, leave)
            if low > high:
                break
        else:
            if high >= 0 and low <= 1:
                return False

    length_squared = dx * dx + dy * dy
    if length_squared < 1e-9:
        return True
    for prop in MAPS[map_id].get("props", ()):
        if prop["kind"] not in BLOCKING_PROP_KINDS:
            continue
        radius = prop["size"] * .34 + 2
        t = max(0.0, min(1.0, ((prop["x"] - x1) * dx +
                               (prop["y"] - y1) * dy) / length_squared))
        nearest_x, nearest_y = x1 + t * dx, y1 + t * dy
        if math.hypot(nearest_x - prop["x"], nearest_y - prop["y"]) < radius:
            return False
    return True


def safe_spawn(map_id: str, players=()):
    active = list(players)
    min_distance = max(36, 88 - len(active) * 2)
    best_spawn = None
    best_clearance = -1.0
    for _ in range(240):
        x, y = random.randint(54, WIDTH - 54), random.randint(54, HEIGHT - 54)
        if collides(map_id, x, y):
            continue
        clearance = min((math.hypot(p.x - x, p.y - y) for p in active), default=float("inf"))
        if clearance > best_clearance:
            best_spawn, best_clearance = (x, y), clearance
        if clearance >= min_distance:
            return x, y
    if best_spawn:
        return best_spawn
    candidates = [(x, y) for y in range(32, HEIGHT - 31, 24)
                  for x in range(32, WIDTH - 31, 24) if not collides(map_id, x, y)]
    if not candidates:
        raise RuntimeError(f"No safe spawn point exists on map {map_id!r}")
    return max(candidates, key=lambda point: min(
        (math.hypot(p.x - point[0], p.y - point[1]) for p in active), default=float("inf")))


def room_capacity(mode: str):
    return ROOM_CAPACITIES.get(mode, ROOM_CAPACITIES["normal"])


def _assign_team(room: Room):
    if not MODES[room.mode]["teams"]:
        return 0
    counts = [sum(1 for p in room.players.values() if p.team == team and
                  (room.mode != "zombie_coop" or not p.is_zombie)) for team in (0, 1)]
    return 0 if counts[0] <= counts[1] else 1


def _make_flags(room: Room):
    if not MODES[room.mode]["flags"]:
        return
    flag_margin = round(76 * MAP_SCALE)
    flag_y = round(320 * MAP_SCALE)
    room.flags = {
        "0": {"team": 0, "home_x": flag_margin, "home_y": flag_y,
              "x": flag_margin, "y": flag_y,
              "carrier": None, "return_at": 0},
        "1": {"team": 1, "home_x": WIDTH - flag_margin, "home_y": flag_y,
              "x": WIDTH - flag_margin, "y": flag_y,
              "carrier": None, "return_at": 0},
    }


def _populate_bots(room: Room):
    if room.mode == "duel":
        return
    count = 18 if room.mode == "zombie_coop" else 4
    for index in range(count):
        x, y = safe_spawn(room.map_id, room.players.values())
        zombie = room.mode in {"zombie_coop", "zombie_dm"}
        if room.mode == "team_dm":
            team = index % 2
        elif room.mode == "zombie_coop":
            team = 1
        elif room.mode == "ctf":
            team = index % 2
        else:
            team = 2 if zombie else index
        bot = Player(
            id=f"bot-{secrets.token_hex(3)}", name=("MITE-" + str(index + 1).zfill(2)),
            x=x, y=y, hue="#f3bb61" if zombie else PLAYER_COLORS[index % len(PLAYER_COLORS)],
            hp=140 if zombie else 100, weapon="bug" if zombie else "seeker",
            is_bot=True, team=team, is_zombie=zombie,
        )
        room.players[bot.id] = bot


def _can_damage(room: Room, source: Player, target: Player):
    if source.id == target.id:
        return False
    if source.is_zombie and target.is_zombie:
        return False
    if room.mode == "zombie_coop":
        return source.is_zombie != target.is_zombie
    if MODES[room.mode]["teams"] and not source.is_zombie and not target.is_zombie:
        return source.team != target.team
    return True


def player_view(player: Player, map_id: str, viewer_id: str | None = None,
                now: float | None = None, viewer: Player | None = None):
    now = time.monotonic() if now is None else now
    hidden = in_cover(map_id, player.x, player.y)
    concealed = _player_concealed(player, map_id, viewer_id, viewer, now)
    owner_view = player.id == viewer_id
    maximum_hp = 140 if player.is_zombie else 100 + player.upgrades["vitality"] * 20
    ammo = None
    if player.id == viewer_id:
        ammo = {
            key: {**value, "reload_remaining": round(max(0, value.get("reload_until", 0) - now), 2)}
            for key, value in player.ammo.items()
        }
    return {
        "id": player.id, "name": player.name,
        "x": None if concealed else round(player.x, 1),
        "y": None if concealed else round(player.y, 1),
        "angle": None if concealed else round(math.atan2(player.aim_y - player.y, player.aim_x - player.x), 3),
        "hue": player.hue, "skin": player.skin, "hp": player.hp, "weapon": player.weapon,
        "alternate_fire": player.alternate_fire,
        "skill_points": max(0, player.score // 200),
        "max_hp": maximum_hp, "armor": player.armor, "max_armor": 100,
        "upgrades": player.upgrades if owner_view else None,
        "score": player.score, "kills": player.kills,
        "deaths": player.deaths, "shielded": player.shield_until > now,
        "switch_remaining": round(max(0, player.switch_until - now), 2),
        "energy": round(player.energy, 1) if player.id == viewer_id else None,
        "jumping": player.jump_until > now,
        "dead": player.dead_until > now,
        "respawn_in": max(0, round(player.dead_until - now, 1)),
        "invincible": player.invincible_until > now,
        # ``hidden`` is viewer-relative for rendering. Keep ``in_cover`` and
        # ``cover_exposed`` available for effects and debugging without
        # leaking coordinates when the player is concealed.
        "hidden": concealed, "in_cover": hidden,
        "cover_exposed": hidden and player.cover_exposed_until > now,
        "is_bot": player.is_bot,
        "owned_weapons": sorted(player.owned_weapons) if owner_view else [],
        "team": player.team, "is_zombie": player.is_zombie, "lives": player.lives,
        "captures": player.captures, "souls": player.souls,
        "carried_flag": player.carried_flag,
        "ammo": ammo or {},
    }


def _room_state_interval(humans: int):
    if humans >= STATE_CROWD_THRESHOLD:
        return STATE_INTERVAL_CROWDED
    if humans >= STATE_SHARED_VIEW_THRESHOLD:
        return FAST_TICK_RATE
    return TICK_RATE


def _room_tick_rate(humans: int):
    """Use a 90Hz simulation for 8-15 humans, with a safer 20Hz crowded tier."""
    if STATE_SHARED_VIEW_THRESHOLD <= humans < STATE_CROWD_THRESHOLD:
        return FAST_TICK_RATE
    return TICK_RATE


def _record_room_tick_profile(room: Room, wake_late_ms: float,
                              simulation_ms: float, broadcast_ms: float):
    if not PROFILE_ROOM_TICKS:
        return
    samples = room.tick_profile_samples
    samples.append((wake_late_ms, simulation_ms, broadcast_ms))
    if len(samples) < 300:
        return

    columns = tuple(zip(*samples))
    labels = ("wake_late_ms", "simulation_ms", "broadcast_ms")
    summary = {}
    for label, values in zip(labels, columns):
        ordered = sorted(values)
        summary[label] = {
            "p50": round(ordered[len(ordered) // 2], 2),
            "p95": round(ordered[round((len(ordered) - 1) * .95)], 2),
            "max": round(ordered[-1], 2),
        }
    logger.warning("arena_tick_profile room=%s samples=%d profile=%s",
                   room.code, len(samples), json.dumps(summary, separators=(",", ":")))
    samples.clear()


def _public_roster_signature(room: Room):
    return tuple(
        (player.id, player.name, player.hue, player.skin, player.is_bot,
         player.team, player.is_zombie, player.upgrades.get("vitality", 0))
        for player in room.players.values()
    )


def _compact_public_players(players):
    return [
        {key: player[key] for key in PLAYER_DYNAMIC_VIEW_FIELDS if key in player}
        for player in players
    ]


def _state_snapshot(room: Room):
    """Build state data shared by every viewer in one broadcast tick."""
    humans = sum(not player.is_bot for player in room.players.values())
    state_interval = _room_state_interval(humans)
    now = time.monotonic()
    visible_projectiles = [
        {key: round(value, 2) if key in PROJECTILE_FLOAT_FIELDS else value
         for key, value in projectile.items() if key in PROJECTILE_VIEW_FIELDS}
        for projectile in room.projectiles
    ]
    return {
        "now": now,
        "server_time": round(now, 3),
        "state_interval_ms": round(state_interval * 1000),
        "team_scores": dict(room.team_scores),
        "flags": room.flags,
        "winner": room.winner,
        "map_votes": {
            map_id: sum(1 for vote in room.map_votes.values() if vote == map_id)
            for map_id in MAPS
        },
        "map_vote_in": max(0, round(room.map_vote_deadline - now, 1)) if room.winner else 0,
        "players": [player_view(p, room.map_id, None, now) for p in room.players.values()],
        "projectiles": visible_projectiles,
        "pickup_spawns": [
            {"id": item["id"], "x": item["x"], "y": item["y"],
             "weapon": item["weapon"], "available": item["respawn_at"] <= now,
             "respawn_in": max(0, round(item["respawn_at"] - now, 1))}
            for item in room.pickups
        ],
        "pickups": [
            {"id": item["id"], "x": item["x"], "y": item["y"], "weapon": item["weapon"],
             "color": WEAPONS[item["weapon"]]["color"]}
            for item in room.pickups if item["respawn_at"] <= now
        ],
        "resource_spawns": [
            {"id": item["id"], "x": item["x"], "y": item["y"],
             "kind": item["kind"], "available": item["respawn_at"] <= now,
             "respawn_in": max(0, round(item["respawn_at"] - now, 1))}
            for item in room.resources
        ],
        "resources": [
            {"id": item["id"], "x": item["x"], "y": item["y"],
             "kind": item["kind"], "color": RESOURCE_ITEMS[item["kind"]]["color"]}
            for item in room.resources if item["respawn_at"] <= now
        ],
    }


def room_view(room: Room, viewer_id: str | None = None, snapshot: dict | None = None):
    snapshot = snapshot or _state_snapshot(room)
    now = snapshot["now"]
    players = list(snapshot["players"])
    if viewer_id:
        viewer = room.players.get(viewer_id)
        for index, player in enumerate(room.players.values()):
            if player.id == viewer_id:
                players[index] = player_view(player, room.map_id, viewer_id, now, viewer)
                break
        # In small rooms only the owner needs a private patch, but every
        # player's concealment is still evaluated relative to the viewer.
        if viewer:
            players = [player_view(player, room.map_id, viewer_id, now, viewer)
                       for player in room.players.values()]
    return {
        "type": "state", "room": room.code, "map": room.map_id, "mode": room.mode,
        "mode_name": MODES[room.mode]["name"], "capacity": room_capacity(room.mode),
        "state_interval_ms": snapshot["state_interval_ms"], "team_scores": snapshot["team_scores"],
        "flags": snapshot["flags"], "winner": snapshot["winner"],
        "map_votes": snapshot["map_votes"],
        "voted_map": room.map_votes.get(viewer_id) if viewer_id else None,
        "map_vote_in": snapshot["map_vote_in"],
        "players": players,
        "projectiles": snapshot["projectiles"], "feed": room.feed[-10:],
        "pickup_spawns": snapshot["pickup_spawns"], "pickups": snapshot["pickups"],
        "resource_spawns": snapshot["resource_spawns"], "resources": snapshot["resources"],
        "server_time": snapshot["server_time"],
    }


def room_card(room: Room):
    humans = [p for p in room.players.values() if not p.is_bot]
    capacity = room_capacity(room.mode)
    return {"code": room.code, "map": room.map_id, "map_name": MAPS[room.map_id]["name"],
            "mode": room.mode, "mode_name": MODES[room.mode]["name"],
            "players": len(humans), "capacity": capacity}


async def broadcast(room: Room, message: dict | None = None):
    is_state = message is None or message.get("type") == "state"
    snapshot = _state_snapshot(room) if is_state else None
    shared_state = is_state and len(room.sockets) >= STATE_SHARED_VIEW_THRESHOLD
    public_text = None
    private_texts = {}
    send_private = shared_state and snapshot["now"] - room.last_private_broadcast >= .2
    if shared_state:
        # The public state is identical for every viewer. Encode it once, then
        # append a small private patch for each player with ammo and upgrades.
        public_payload = room_view(room, None, snapshot)
        public_payload.pop("voted_map", None)
        roster_signature = _public_roster_signature(room)
        roster_changed = room.public_roster_signature != roster_signature
        room.public_roster_signature = roster_signature
        if not roster_changed:
            public_payload["players"] = _compact_public_players(public_payload["players"])
            public_payload["players_compact"] = True
        public_text = json.dumps(public_payload, ensure_ascii=False, separators=(",", ":"))
        if send_private:
            room.last_private_broadcast = snapshot["now"]
            private_texts = {
                player_id: json.dumps({
                    "type": "private",
                    "player": player_view(player, room.map_id, player_id, snapshot["now"]),
                    "players": [player_view(other, room.map_id, player_id,
                                             snapshot["now"], player)
                                for other in room.players.values()],
                    "voted_map": room.map_votes.get(player_id),
                }, ensure_ascii=False, separators=(",", ":"))
                for player_id, player in room.players.items()
                if player_id in room.sockets
            }

    async def deliver(player_id, socket):
        try:
            if shared_state:
                await socket.send_text(public_text)
                private_text = private_texts.get(player_id)
                if private_text:
                    await socket.send_text(private_text)
            elif is_state:
                await socket.send_json(room_view(room, player_id, snapshot))
            else:
                await socket.send_json(message)
            return None
        except Exception:
            return player_id

    results = await asyncio.gather(
        *(deliver(player_id, socket) for player_id, socket in tuple(room.sockets.items()))
    )
    stale = [player_id for player_id in results if player_id]
    for player_id in stale:
        room.sockets.pop(player_id, None)
        player = room.players.pop(player_id, None)
        if player and not player.is_bot:
            add_feed(room, player.name + " lost relay signal")
    async def deliver_spectator(spectator_id, socket):
        try:
            if shared_state:
                await socket.send_text(public_text)
            elif is_state:
                await socket.send_json(room_view(room, None, snapshot))
            else:
                await socket.send_json(message)
            return None
        except Exception:
            return spectator_id

    spectator_results = await asyncio.gather(
        *(deliver_spectator(spectator_id, socket)
          for spectator_id, socket in tuple(room.spectator_sockets.items()))
    )
    stale_spectators = [spectator_id for spectator_id in spectator_results if spectator_id]
    for spectator_id in stale_spectators:
        room.spectator_sockets.pop(spectator_id, None)
    humans = [p for p in room.players.values() if not p.is_bot]
    if not humans:
        for socket in tuple(room.spectator_sockets.values()):
            try:
                await socket.close(code=1001)
            except Exception:
                pass
        room.spectator_sockets.clear()
        rooms.pop(room.code, None)
    elif room.mode != "duel" and len(humans) == 1 and not any(p.is_bot for p in room.players.values()):
        bx, by = safe_spawn(room.map_id, room.players.values())
        bot = Player(id=f"bot-{secrets.token_hex(3)}", name="MITE-07", x=bx, y=by,
                     hue="#f3bb61", weapon="seeker", is_bot=True)
        room.players[bot.id] = bot


def add_feed(room: Room, content: str):
    room.next_id += 1
    room.feed.append({"id": room.next_id, "content": content, "at": time.monotonic()})
    room.feed = room.feed[-20:]


def _nearest_opponent(room: Room, player: Player):
    candidates = [p for p in room.players.values()
                  if p.dead_until <= time.monotonic() and _can_damage(room, player, p)
                  and not in_cover(room.map_id, p.x, p.y)
                  and has_line_of_sight(room.map_id, player.x, player.y, p.x, p.y)]
    return min(candidates, key=lambda p: math.hypot(p.x - player.x, p.y - player.y),
               default=None)


def _choose_bot_input(room: Room, bot: Player, now: float):
    if now < bot.bot_next_think:
        return
    bot.bot_next_think = now + .16
    target = _nearest_opponent(room, bot)
    if not target:
        bot.move_x = random.uniform(-.65, .65)
        bot.move_y = random.uniform(-.65, .65)
        bot.firing = False
        return
    dx, dy = target.x - bot.x, target.y - bot.y
    distance = max(1, math.hypot(dx, dy))
    bot.aim_x, bot.aim_y = target.x, target.y
    if distance < 190:
        bot.move_x, bot.move_y = dy / distance, -dx / distance
    elif distance > 310:
        bot.move_x, bot.move_y = dx / distance, dy / distance
    else:
        bot.move_x = bot.move_y = 0
    bot.weapon = "seeker" if distance > 240 else "rotary"
    if bot.is_zombie:
        bot.weapon = "bug"
        if distance > 235:
            bot.move_x, bot.move_y = dx / distance, dy / distance
        else:
            bot.move_x = bot.move_y = 0
    bot.firing = distance < 490


def _apply_knockback(room: Room, target: Player, center_x: float, center_y: float,
                     force: float, now: float, source: Player | None = None):
    dx, dy = target.x - center_x, target.y - center_y
    distance = math.hypot(dx, dy)
    if distance < .001:
        angle = random.random() * math.tau
        dx, dy, distance = math.cos(angle), math.sin(angle), 1
    target.knockback_x += dx / distance * force
    target.knockback_y += dy / distance * force
    target.knockback_until = max(target.knockback_until, now + .65)
    if source and source.id != target.id:
        target.knockback_source = source.id


def _fall_into_water(room: Room, player: Player, now: float):
    if player.dead_until > now:
        return
    drop_flag(room, player, now)
    player.deaths += 1
    if room.mode == "duel":
        player.lives -= 1
        if player.lives <= 0:
            source = room.players.get(player.knockback_source or "")
            if source:
                room.winner = source.id
    _reset_player_loadout(player)
    player.hp = 0
    player.dead_until = now + RESPAWN_DELAY
    player.invincible_until = 0
    player.knockback_x = player.knockback_y = 0
    player.knockback_until = 0
    player.knockback_source = None
    player.firing = False
    player.x, player.y = safe_spawn(room.map_id, [p for p in room.players.values() if p.id != player.id])
    player.portal_cooldown_until = 0
    add_feed(room, player.name + " fell into the river")


def _move_player(room: Room, player: Player, dt: float, now: float):
    if not player.is_bot and now - player.last_input > 1.3:
        player.move_x = player.move_y = 0
        player.firing = False
    if player.knockback_until > now:
        knock_dx, knock_dy = player.knockback_x * dt, player.knockback_y * dt
        if not collides(room.map_id, player.x + knock_dx, player.y, include_water=False):
            player.x += knock_dx
        if not collides(room.map_id, player.x, player.y + knock_dy, include_water=False):
            player.y += knock_dy
        decay = math.exp(-dt * 8)
        player.knockback_x *= decay
        player.knockback_y *= decay
        _maybe_teleport_player(room, player, now)
        if in_water(room.map_id, player.x, player.y, 15):
            _fall_into_water(room, player, now)
            return
    else:
        player.knockback_x = player.knockback_y = 0
        player.knockback_source = None
    mx, my = player.move_x, player.move_y
    speed = (192 + player.upgrades["velocity"] * 25) * \
        WEAPONS.get(player.weapon, WEAPONS["pulse"]).get("movement_modifier", 1) * \
        PLAYER_SPEED_SCALE
    if player.is_zombie and room.mode == "zombie_coop":
        speed *= 1.1
    if player.dash_until > now:
        mx, my = player.dash_x, player.dash_y
        speed = 660
    elif mx or my:
        length = math.hypot(mx, my) or 1
        mx, my = mx / length, my / length
    dx, dy = mx * speed * dt, my * speed * dt
    if not collides(room.map_id, player.x + dx, player.y):
        player.x += dx
    if not collides(room.map_id, player.x, player.y + dy):
        player.y += dy
    _maybe_teleport_player(room, player, now)
    if player.aiming and not (mx or my):
        if not player.aim_started:
            player.aim_started = now
    else:
        player.aim_started = 0


def _is_ally(room: Room, source: Player, target: Player):
    if source.id == target.id:
        return True
    if room.mode == "zombie_coop":
        return not source.is_zombie and not target.is_zombie
    if MODES[room.mode]["teams"]:
        return (not source.is_zombie and not target.is_zombie and
                source.team == target.team)
    return False


def _heal_player(room: Room, source: Player, target: Player, amount: float, now: float):
    if (source.dead_until > now or target.dead_until > now or
            not _is_ally(room, source, target)):
        return 0
    maximum = 140 if target.is_zombie else 100 + target.upgrades["vitality"] * 20
    previous = target.hp
    target.hp = min(maximum, target.hp + int(round(amount)))
    healed = target.hp - previous
    if healed:
        add_feed(room, f"{source.name} healed {target.name}")
    return healed


def _discard_empty_weapon(player: Player, weapon_key: str, now: float):
    """Remove a finite-ammo pickup once its magazine and reserve are empty."""
    if weapon_key == "pulse" or weapon_key not in player.owned_weapons:
        return False
    ammo = player.ammo.get(weapon_key)
    if not ammo or ammo.get("mag", 0) > 0 or ammo.get("reserve", 0) > 0 or ammo.get("reload_until", 0) > now:
        return False
    player.owned_weapons.discard(weapon_key)
    if player.weapon == weapon_key:
        # Fall back to the infinite basic weapon.  The fallback itself still
        # respects the normal switch delay so an empty pickup cannot become a
        # free instant weapon swap.
        player.weapon = "pulse"
        player.alternate_fire = False
        player.aim_started = 0
        player.switch_until = max(player.switch_until, now + WEAPON_SWITCH_DELAY)
    return True


def _spawn_projectile(room: Room, player: Player, now: float):
    fired_weapon_key = player.weapon
    base_weapon = WEAPONS.get(player.weapon, WEAPONS["pulse"])
    weapon = ({**base_weapon, **base_weapon["alternate"]}
              if player.alternate_fire and base_weapon.get("alternate") else base_weapon)
    ammo = player.ammo[player.weapon]
    if now < player.switch_until:
        return
    if ammo["reload_until"] > 0:
        if now < ammo["reload_until"]:
            return
        loaded = (weapon["clip"] - ammo["mag"] if ammo["reserve"] < 0 else
                  min(weapon["clip"] - ammo["mag"], ammo["reserve"]))
        ammo["mag"] += loaded
        if ammo["reserve"] >= 0:
            ammo["reserve"] -= loaded
        ammo["reload_until"] = 0
        if _discard_empty_weapon(player, player.weapon, now):
            return
    if not player.firing or now - player.last_shot < weapon["cooldown"]:
        return
    if ammo["mag"] == 0:
        if ammo["reserve"] < 0:
            ammo["mag"] = weapon["clip"]
        elif ammo["reserve"] == 0:
            return
        else:
            ammo["reload_until"] = now + weapon["reload"]
            return
    if ammo["mag"] == 0:
        return
    if weapon.get("charge") and (not player.aiming or not player.aim_started or
                                  now - player.aim_started < weapon["charge"]):
        return
    player.last_shot = now
    if in_cover(room.map_id, player.x, player.y):
        player.cover_exposed_until = max(player.cover_exposed_until,
                                         now + COVER_EXPOSURE_SECONDS)
    if ammo["mag"] > 0:
        ammo["mag"] -= 1
        if ammo["mag"] == 0 and ammo["reserve"] != 0:
            ammo["reload_until"] = now + weapon["reload"]
        elif ammo["mag"] == 0:
            _discard_empty_weapon(player, player.weapon, now)
    if weapon.get("self_heal"):
        _heal_player(room, player, player, weapon["self_heal"], now)
    aim_x, aim_y = player.aim_x, player.aim_y
    if weapon.get("auto_aim_range"):
        candidates = [target for target in room.players.values()
                      if target.dead_until <= now and _is_ally(room, player, target)]
        ally = min(candidates, key=lambda target: math.hypot(target.x - aim_x, target.y - aim_y),
                   default=None)
        if ally and math.hypot(ally.x - aim_x, ally.y - aim_y) <= weapon["auto_aim_range"]:
            aim_x, aim_y = ally.x, ally.y
    dx, dy = aim_x - player.x, aim_y - player.y
    length = math.hypot(dx, dy)
    angle = math.atan2(dy, dx) if length > .001 else 0
    speed = weapon["speed"] * PROJECTILE_SPEED_SCALE
    if weapon["kind"] in MISSILE_KINDS:
        speed *= MISSILE_SPEED_SCALE
    damage = weapon["damage"] * (1 + player.upgrades["amplify"] * .12)
    projectile_count = weapon.get("projectiles", 1)
    target_x, target_y = aim_x, aim_y
    flight_life = weapon["life"]
    if weapon["kind"] == "arc" and weapon.get("range"):
        target_distance = min(length, weapon["range"])
        if length > .001:
            target_x = player.x + math.cos(angle) * target_distance
            target_y = player.y + math.sin(angle) * target_distance
        flight_life = max(.05, target_distance / max(speed, 1))
    for pellet in range(projectile_count):
        pellet_angle = angle + random.uniform(-weapon["spread"], weapon["spread"])
        room.next_id += 1
        projectile = {
            "id": room.next_id, "owner": player.id, "weapon": fired_weapon_key, "age": 0,
            "x": player.x + math.cos(pellet_angle) * 23, "y": player.y + math.sin(pellet_angle) * 23,
            "vx": math.cos(pellet_angle) * speed, "vy": math.sin(pellet_angle) * speed,
            "r": (max(1, weapon["size"]) if "size" in weapon else
                  (8 if weapon["kind"] in {"arc", "rocket", "seeker", "cursor", "bug", "energy_orb"} else 4)),
            "life": flight_life, "total_life": flight_life, "kind": weapon["kind"], "damage": damage,
            "falloff": weapon.get("falloff", 0),
            "blast": (weapon.get("blast", 0) * MISSILE_BLAST_SCALE
                       if weapon["kind"] in MISSILE_KINDS else weapon.get("blast", 0)),
            "bounces": weapon.get("bounces", 0),
            "turn": weapon.get("turn", 0) * HOMING_TURN_SCALE,
            "pierce": weapon.get("pierce", 0),
            "combo_damage": weapon.get("combo_damage", 0),
            "combo_blast": weapon.get("combo_blast", 0),
            "knockback": 720 if weapon["kind"] in MISSILE_KINDS and weapon.get("blast", 0) else 0,
            "max_range": weapon.get("range", 0), "distance_travelled": 0,
            "target_id": None, "hit_targets": [],
            "self_damage": weapon["kind"] in MISSILE_KINDS and bool(weapon.get("blast", 0)),
            "target_x": target_x, "target_y": target_y,
            "color": weapon["color"],
        }
        room.projectiles.append(projectile)
    if weapon.get("charge"):
        player.aim_started = now


def _hurt(room: Room, source: Player, target: Player, amount: float, now: float, *, allow_self=False):
    self_hit = source.id == target.id
    if (target.invincible_until > now or target.jump_until > now or
            target.dead_until > now or amount <= 0 or
            (self_hit and not allow_self) or
            (not self_hit and not _can_damage(room, source, target))):
        return
    if in_cover(room.map_id, target.x, target.y):
        target.cover_exposed_until = max(target.cover_exposed_until,
                                         now + COVER_EXPOSURE_SECONDS)
    if target.shield_until > now:
        amount = min(amount, 10)
    absorbed = min(target.armor, max(0, int(round(amount * .55))))
    target.armor -= absorbed
    target.hp -= max(1, int(round(amount - absorbed)))
    if target.hp > 0:
        return
    target.deaths += 1
    if not self_hit:
        source.kills += 1
        source.score += 100
        source.souls += 30 if room.mode == "team_dm" else 1
        if room.mode == "zombie_dm" and source.souls >= 1200:
            room.winner = source.id
        if room.mode == "team_dm" and source.team in (0, 1):
            team = str(source.team)
            room.team_scores[team] += 30
            if room.team_scores[team] >= 1200:
                room.winner = team
        if room.mode == "duel":
            target.lives -= 1
            if target.lives <= 0:
                room.winner = source.id
    drop_flag(room, target, now)
    converted = False
    if room.mode == "zombie_coop" and not target.is_zombie and source.is_zombie and random.random() < .2:
        target.is_zombie = True
        target.team = 1
        target.hue = "#f3bb61"
        target.weapon = "bug"
        target.owned_weapons = {"bug"}
        target.ammo["bug"] = {"mag": WEAPONS["bug"]["clip"], "reserve": -1, "reload_until": 0}
        target.hp = 140
        converted = True
        add_feed(room, target.name + " joined the infected")
        if not any(not p.is_zombie and not p.is_bot for p in room.players.values()):
            room.winner = "zombies"
    elif target.is_zombie:
        target.hp = 0
        target.weapon = "bug"
    else:
        _reset_player_loadout(target)
        target.hp = 0
    if not converted:
        target.dead_until = now + RESPAWN_DELAY
        target.invincible_until = 0
    target.x, target.y = safe_spawn(room.map_id, [p for p in room.players.values() if p.id != target.id])
    target.move_x = target.move_y = 0
    target.knockback_x = target.knockback_y = 0
    target.knockback_until = 0
    target.knockback_source = None
    target.firing = False
    if not converted:
        add_feed(room, f"{target.name} caught their own blast" if self_hit
                 else f"{source.name} tagged out {target.name}")


def drop_flag(room: Room, player: Player, now: float):
    if player.carried_flag is None:
        return
    flag = room.flags.get(str(player.carried_flag))
    if flag:
        flag["carrier"] = None
        flag["x"], flag["y"] = player.x, player.y
        flag["return_at"] = now + 12
    player.carried_flag = None


def _reset_player_loadout(player: Player):
    """Respawn with the basic weapon, as in the reference game."""
    player.armor = 0
    player.cover_exposed_until = 0
    player.owned_weapons = set(WEAPONS) if player.is_bot else {"pulse"}
    player.weapon = "seeker" if player.is_bot else "pulse"
    player.aim_started = 0
    player.switch_until = 0
    player.knockback_x = player.knockback_y = 0
    player.knockback_until = 0
    player.knockback_source = None
    for key, weapon in WEAPONS.items():
        if weapon["clip"] < 0:
            player.ammo[key] = {"mag": -1, "reserve": -1, "reload_until": 0}
        elif player.is_bot:
            player.ammo[key] = {"mag": weapon["clip"], "reserve": -1, "reload_until": 0}
        else:
            player.ammo[key] = {"mag": 0, "reserve": 0, "reload_until": 0}


def _reset_round(room: Room, map_id: str, now: float):
    """Start a fresh round in the same room after a completed match vote."""
    room.map_id = map_id if map_id in MAPS else "tidal"
    room.winner = None
    room.map_votes.clear()
    room.map_vote_deadline = 0
    room.flags = {}
    room.pickups = []
    room.resources = []
    room.projectiles.clear()
    room.feed.clear()
    room.team_scores = {"0": 0, "1": 0}
    room.next_id = 0
    room.started_at = now
    _make_flags(room)
    _make_pickups(room)
    _make_resources(room)
    placed = []
    for player in room.players.values():
        player.x, player.y = safe_spawn(room.map_id, placed)
        placed.append(player)
        player.hp = 140 if player.is_zombie else 100 + player.upgrades["vitality"] * 20
        player.armor = 0
        player.cover_exposed_until = 0
        player.energy = START_ENERGY
        player.score = player.kills = player.deaths = player.captures = player.souls = 0
        player.lives = 5 if room.mode == "duel" else 0
        player.carried_flag = None
        player.dead_until = 0
        player.invincible_until = now + SPAWN_INVINCIBILITY
        player.move_x = player.move_y = 0
        player.firing = player.aiming = player.alternate_fire = False
        _reset_player_loadout(player)
    add_feed(room, "New round · " + MAPS[room.map_id]["name"])


def _complete_map_vote(room: Room, now: float, *, force=False):
    if not room.winner:
        return False
    humans = [player.id for player in room.players.values() if not player.is_bot]
    if not humans:
        return False
    if not force and (not room.map_vote_deadline or now < room.map_vote_deadline):
        return False
    counts = {candidate: sum(vote == candidate for vote in room.map_votes.values())
              for candidate in MAPS}
    highest = max(counts.values(), default=0)
    leaders = [candidate for candidate, count in counts.items() if count == highest]
    selected = room.map_id if len(leaders) > 1 else leaders[0] if leaders else room.map_id
    _reset_round(room, selected, now)
    return True


def _record_map_vote(room: Room, player_id: str, map_id: str, now: float):
    if not room.winner or map_id not in MAPS or player_id not in room.players:
        return False
    if room.players[player_id].is_bot:
        return False
    if not room.map_vote_deadline:
        room.map_vote_deadline = now + 15
    room.map_votes[player_id] = map_id
    humans = [player.id for player in room.players.values() if not player.is_bot]
    if humans and all(player_id in room.map_votes for player_id in humans):
        return _complete_map_vote(room, now, force=True)
    return False


def _update_flags(room: Room, now: float):
    if not room.flags or room.winner:
        return
    for flag in room.flags.values():
        carrier = room.players.get(flag["carrier"]) if flag["carrier"] else None
        if carrier:
            flag["x"], flag["y"] = carrier.x, carrier.y
        elif flag["carrier"]:
            flag["carrier"] = None
            flag["return_at"] = now + 12
        elif flag["return_at"] and now >= flag["return_at"]:
            flag["x"], flag["y"] = flag["home_x"], flag["home_y"]
            flag["return_at"] = 0
    for player in room.players.values():
        if player.is_zombie or player.dead_until > now:
            continue
        own_flag = room.flags[str(player.team)]
        if own_flag["carrier"] is None and own_flag["return_at"] and math.hypot(
                player.x - own_flag["x"], player.y - own_flag["y"]) < 21:
            own_flag["x"], own_flag["y"] = own_flag["home_x"], own_flag["home_y"]
            own_flag["return_at"] = 0
            add_feed(room, player.name + " returned the home flag")
        if player.carried_flag is None:
            enemy_flag = room.flags[str(1 - player.team)]
            at_home = enemy_flag["x"] == enemy_flag["home_x"] and enemy_flag["y"] == enemy_flag["home_y"]
            if enemy_flag["carrier"] is None and math.hypot(player.x - enemy_flag["x"], player.y - enemy_flag["y"]) < 22:
                enemy_flag["carrier"] = player.id
                enemy_flag["return_at"] = 0
                player.carried_flag = 1 - player.team
                add_feed(room, player.name + " took the opposing flag")
        if player.carried_flag is not None:
            own_home = own_flag["carrier"] is None and own_flag["x"] == own_flag["home_x"] and own_flag["y"] == own_flag["home_y"]
            if own_home and math.hypot(player.x - own_flag["home_x"], player.y - own_flag["home_y"]) < 25:
                captured = room.flags[str(player.carried_flag)]
                captured["carrier"] = None
                captured["x"], captured["y"] = captured["home_x"], captured["home_y"]
                player.carried_flag = None
                player.captures += 1
                player.score += 150
                room.team_scores[str(player.team)] += 1
                add_feed(room, player.name + " captured the flag")
                if room.team_scores[str(player.team)] >= 3:
                    room.winner = str(player.team)


def _blast(room: Room, projectile: dict, now: float):
    radius = projectile.get("blast", 0)
    if radius <= 0:
        return
    source = room.players.get(projectile["owner"])
    if not source:
        return
    for target in room.players.values():
        self_hit = target.id == source.id
        if (self_hit and not projectile.get("self_damage")) or (not self_hit and not _can_damage(room, source, target)):
            continue
        distance = math.hypot(target.x - projectile["x"], target.y - projectile["y"])
        if distance <= radius + 17 and (self_hit or has_line_of_sight(
                room.map_id, projectile["x"], projectile["y"], target.x, target.y)):
            scale = max(.2, 1 - distance / (radius + 17))
            if projectile.get("knockback", 0):
                _apply_knockback(room, target, projectile["x"], projectile["y"],
                                 projectile["knockback"] * scale, now, source)
            _hurt(room, source, target, projectile["damage"] * scale, now, allow_self=self_hit)


def _steer(room: Room, projectile: dict, dt: float):
    target = None
    if projectile["kind"] == "cursor":
        owner = room.players.get(projectile["owner"])
        if owner:
            projectile["target_x"], projectile["target_y"] = owner.aim_x, owner.aim_y
    elif projectile.get("target_id"):
        target = room.players.get(projectile["target_id"])
        owner = room.players.get(projectile["owner"])
        if target and (not owner or target.dead_until > time.monotonic() or
                       not _can_damage(room, owner, target) or
                       in_cover(room.map_id, target.x, target.y) or
                       not has_line_of_sight(room.map_id, projectile["x"], projectile["y"],
                                             target.x, target.y)):
            target = None
            projectile["target_id"] = None
            target = _nearest_opponent(room, owner) if owner else None
            if target:
                projectile["target_id"] = target.id
    else:
        owner = room.players.get(projectile["owner"])
        target = _nearest_opponent(room, owner) if owner else None
        if target:
            projectile["target_id"] = target.id
    if target:
        tx, ty = target.x, target.y
    else:
        tx, ty = projectile["target_x"], projectile["target_y"]
    desired = math.atan2(ty - projectile["y"], tx - projectile["x"])
    current = math.atan2(projectile["vy"], projectile["vx"])
    delta = math.atan2(math.sin(desired - current), math.cos(desired - current))
    limit = projectile["turn"] * dt
    current += max(-limit, min(limit, delta))
    speed = math.hypot(projectile["vx"], projectile["vy"])
    projectile["vx"], projectile["vy"] = math.cos(current) * speed, math.sin(current) * speed


def _impact(room: Room, projectile: dict, now: float, target: Player | None = None):
    source = room.players.get(projectile["owner"])
    if projectile["kind"] == "heal_beam":
        if target and source:
            _heal_player(room, source, target, projectile["damage"], now)
        return
    if target and source and projectile.get("blast", 0) <= 0:
        amount = projectile["damage"]
        if projectile.get("falloff"):
            distance = math.hypot(target.x - source.x, target.y - source.y)
            # Shotgun pellets lose damage with range, matching the reference
            # weapon's per-range falloff while retaining the original spread.
            amount *= max(.1, 1 - projectile["falloff"] * distance / 160)
        _hurt(room, source, target, amount, now)
    elif projectile.get("blast", 0):
        _blast(room, projectile, now)


def _detonate_energy_orb(room: Room, orb: dict, now: float, *, combo=False):
    if orb.get("detonated"):
        return
    if combo:
        orb["damage"] = orb.get("combo_damage", orb["damage"])
        orb["blast"] = orb.get("combo_blast", orb["blast"])
    orb["detonated"] = True
    _blast(room, orb, now)


def _is_missile_projectile(projectile: dict):
    return projectile.get("kind") in MISSILE_KINDS and projectile.get("blast", 0) > 0


def _segment_point_distance(px: float, py: float, x1: float, y1: float,
                            x2: float, y2: float):
    dx, dy = x2 - x1, y2 - y1
    length_squared = dx * dx + dy * dy
    if length_squared < 1e-9:
        return math.hypot(px - x1, py - y1)
    progress = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / length_squared))
    nearest_x, nearest_y = x1 + progress * dx, y1 + progress * dy
    return math.hypot(px - nearest_x, py - nearest_y)


def _missile_collision(room: Room, projectile: dict, old_x: float, old_y: float,
                       next_x: float, next_y: float):
    if not _is_missile_projectile(projectile):
        return None
    for other in room.projectiles:
        if other is projectile or other.get("detonated") or not _is_missile_projectile(other):
            continue
        reach = projectile.get("r", 8) + other.get("r", 8) + 2
        if _segment_point_distance(other["x"], other["y"], old_x, old_y, next_x, next_y) <= reach:
            return other
    return None


def _detonate_missile_pair(room: Room, first: dict, second: dict, x: float, y: float, now: float):
    if first.get("detonated") or second.get("detonated"):
        return
    midpoint_x = (x + second["x"]) / 2
    midpoint_y = (y + second["y"]) / 2
    first["x"], first["y"] = midpoint_x, midpoint_y
    second["x"], second["y"] = midpoint_x, midpoint_y
    first["detonated"] = True
    second["detonated"] = True
    _impact(room, first, now)
    _impact(room, second, now)


def _advance_projectiles(room: Room, dt: float, now: float):
    remaining = []
    for projectile in room.projectiles:
        if projectile.get("detonated"):
            continue
        if projectile["kind"] == "heal_wave":
            projectile["age"] += dt
            projectile["life"] -= dt
            if projectile["life"] > 0:
                remaining.append(projectile)
            continue
        if projectile["kind"] in {"seeker", "cursor", "bug"}:
            _steer(room, projectile, dt)
        distance = math.hypot(projectile["vx"] * dt, projectile["vy"] * dt)
        steps = max(1, min(12, math.ceil(distance / 9)))
        collided = False
        for _ in range(steps):
            old_x, old_y = projectile["x"], projectile["y"]
            nx = old_x + projectile["vx"] * dt / steps
            ny = old_y + projectile["vy"] * dt / steps
            projectile["x"], projectile["y"] = nx, ny
            if _maybe_teleport_projectile(room, projectile, old_x, old_y, now):
                # Traversing a portal preserves velocity and does not consume
                # the projectile's local range in the destination arena lane.
                continue
            missile = _missile_collision(room, projectile, old_x, old_y, nx, ny)
            if missile:
                _detonate_missile_pair(room, projectile, missile, nx, ny, now)
                collided = True
                break
            source = room.players.get(projectile["owner"])
            if projectile["kind"] == "energy_ray" and source:
                orb = next((candidate for candidate in room.projectiles
                            if candidate is not projectile and not candidate.get("detonated") and
                            candidate["kind"] == "energy_orb" and candidate["owner"] == source.id and
                            math.hypot(candidate["x"] - nx, candidate["y"] - ny) <=
                            candidate["r"] + projectile["r"]), None)
                if orb:
                    _detonate_energy_orb(room, orb, now, combo=True)
                    collided = True
                    break
            hit_targets = projectile.get("hit_targets", ())
            target = next((p for p in room.players.values()
                           if source and p.dead_until <= now and
                           (_is_ally(room, source, p) if projectile["kind"] == "heal_beam"
                            else _can_damage(room, source, p)) and
                           p.id not in hit_targets and
                           math.hypot(p.x - nx, p.y - ny) <= 17 + projectile["r"]), None)
            if target:
                projectile["distance_travelled"] = projectile.get("distance_travelled", 0) + \
                    math.hypot(nx - old_x, ny - old_y)
                _impact(room, projectile, now, target)
                if projectile.get("pierce", 0):
                    projectile["hit_targets"].append(target.id)
                    if projectile["pierce"] > 0:
                        projectile["pierce"] -= 1
                    continue
                collided = True
                break
            outside = (nx < projectile["r"] + 18 or nx > WIDTH - projectile["r"] - 18 or
                       ny < projectile["r"] + 18 or ny > HEIGHT - projectile["r"] - 18)
            # Every weapon projectile stops at solid map geometry.  Cover
            # patches are deliberately not part of ``collides(...,
            # include_water=False)`` so shots can pass through tall grass.
            # Arc projectiles still travel on their high flight path visually,
            # but their landing path cannot tunnel through a wall.
            blocked = outside or collides(room.map_id, nx, ny, projectile["r"], include_water=False)
            if blocked:
                if projectile["bounces"] > 0:
                    projectile["bounces"] -= 1
                    hit_x = collides(room.map_id, nx, old_y, projectile["r"], include_water=False)
                    hit_y = collides(room.map_id, old_x, ny, projectile["r"], include_water=False)
                    if hit_x or not hit_y:
                        projectile["vx"] *= -1
                    if hit_y or not hit_x:
                        projectile["vy"] *= -1
                    projectile["x"], projectile["y"] = old_x, old_y
                    continue
                projectile["x"], projectile["y"] = old_x, old_y
                _impact(room, projectile, now)
                collided = True
                break
            projectile["distance_travelled"] = projectile.get("distance_travelled", 0) + \
                math.hypot(nx - old_x, ny - old_y)
            if (projectile.get("max_range") and
                    projectile["distance_travelled"] >= projectile["max_range"]):
                _impact(room, projectile, now)
                collided = True
                break
        projectile["age"] += dt
        projectile["life"] -= dt
        if not collided and projectile["life"] <= 0:
            _impact(room, projectile, now)
            collided = True
        if not collided:
            remaining.append(projectile)
    room.projectiles = [projectile for projectile in remaining if not projectile.get("detonated")]


def _use_ability(room: Room, player: Player, ability: str, now: float):
    if player.dead_until > now:
        return False
    cost = ABILITY_ENERGY_COSTS.get(ability, 0.0)
    if player.energy < cost:
        return False
    if ability == "dash" and now >= player.next_dash:
        dx, dy = player.move_x, player.move_y
        length = math.hypot(dx, dy)
        if length < .01:
            dx, dy = player.aim_x - player.x, player.aim_y - player.y
            length = math.hypot(dx, dy) or 1
        player.dash_x, player.dash_y = dx / length, dy / length
        player.dash_until = now + .20
        player.jump_until = now + .45
        player.next_dash = now + 1.8
        return True
    elif ability == "shield" and now >= player.next_shield:
        player.energy -= cost
        player.shield_until = now + 1.0
        player.next_shield = now + 8
        add_feed(room, f"{player.name} raised a ward")
        return True
    elif ability == "repair" and now >= player.next_repair:
        player.energy -= cost
        player.hp = min(100 + player.upgrades["vitality"] * 20, player.hp + 22)
        player.next_repair = now + 12
        return True
    return False


def _reload(player: Player, now: float):
    weapon = WEAPONS[player.weapon]
    ammo = player.ammo[player.weapon]
    if ammo["mag"] >= weapon["clip"] or ammo["reserve"] <= 0 or ammo["reload_until"] > now:
        return
    ammo["reload_until"] = now + weapon["reload"]


def _make_pickups(room: Room):
    for x, y, weapon_key in MAPS[room.map_id]["pickup_points"]:
        room.next_id += 1
        room.pickups.append({"id": room.next_id, "x": x, "y": y,
                             "weapon": weapon_key, "respawn_at": 0})


def _make_resources(room: Room):
    for x, y, kind in MAPS[room.map_id].get("support_points", ()):
        if kind not in RESOURCE_ITEMS:
            continue
        room.next_id += 1
        room.resources.append({"id": room.next_id, "x": x, "y": y,
                               "kind": kind, "respawn_at": 0})


def _collect_pickups(room: Room, now: float):
    for player in room.players.values():
        if player.is_bot or player.is_zombie or player.dead_until > now:
            continue
        for item in room.pickups:
            if item["respawn_at"] > now or math.hypot(player.x - item["x"], player.y - item["y"]) > 25:
                continue
            weapon = WEAPONS[item["weapon"]]
            ammo = player.ammo[item["weapon"]]
            ammo_size = weapon.get("ammo_size", weapon.get("pickup", 0))
            player.owned_weapons.add(item["weapon"])
            if ammo["mag"] + ammo["reserve"] <= 0:
                loaded = min(ammo_size, weapon["clip"])
                ammo["mag"] = loaded
                ammo["reserve"] += ammo_size - loaded
                add_feed(room, player.name + " picked up " + weapon["name"])
            else:
                ammo["reserve"] += ammo_size
                add_feed(room, player.name + " recovered " + weapon["name"] + " ammo")
            item["respawn_at"] = now + ITEM_RESPAWN
            break


def _collect_resources(room: Room, now: float):
    for player in room.players.values():
        if player.is_bot or player.is_zombie or player.dead_until > now:
            continue
        maximum_hp = 140 if player.is_zombie else 100 + player.upgrades["vitality"] * 20
        for item in room.resources:
            if (item["respawn_at"] > now or
                    math.hypot(player.x - item["x"], player.y - item["y"]) > 25):
                continue
            resource = RESOURCE_ITEMS[item["kind"]]
            if item["kind"] == "health":
                if player.hp >= maximum_hp:
                    continue
                player.hp = min(maximum_hp, player.hp + resource["amount"])
            elif item["kind"] == "armor":
                if player.armor >= 100:
                    continue
                player.armor = min(100, player.armor + resource["amount"])
            item["respawn_at"] = now + RESOURCE_RESPAWN
            add_feed(room, player.name + " picked up " + resource["name"])
            break


async def run_room(room: Room):
    previous = time.monotonic()
    next_tick = previous
    next_state_broadcast = 0.0
    while rooms.get(room.code) is room:
        humans_before_tick = sum(not player.is_bot for player in room.players.values())
        tick_interval = _room_tick_rate(humans_before_tick)
        next_tick += tick_interval
        remaining = next_tick - time.monotonic()
        if remaining > 0:
            await asyncio.sleep(remaining)
        else:
            await asyncio.sleep(0)
        now = time.monotonic()
        wake_late_ms = max(0, (now - next_tick) * 1000)
        if now - next_tick >= tick_interval:
            # Skip missed deadlines instead of sending a burst of catch-up states.
            next_tick = now
        tick_work_started = time.perf_counter()
        dt = min(.09, now - previous)
        previous = now
        humans = [p for p in room.players.values() if not p.is_bot]
        if not humans:
            return
        if room.mode == "zombie_coop" and not any(not p.is_zombie and not p.is_bot for p in room.players.values()):
            room.winner = room.winner or "zombies"
        if room.mode == "zombie_coop" and now - room.started_at >= 600:
            room.winner = room.winner or "humans"
        if room.winner and not room.map_vote_deadline:
            room.map_vote_deadline = now + 15
        if room.winner and _complete_map_vote(room, now):
            await broadcast(room)
        if room.winner:
            for player in room.players.values():
                player.move_x = player.move_y = 0
                player.firing = False
        for player in tuple(room.players.values()):
            if player.dead_until:
                if now < player.dead_until:
                    player.move_x = player.move_y = 0
                    player.firing = False
                    continue
                player.dead_until = 0
                player.x, player.y = safe_spawn(room.map_id, [p for p in room.players.values() if p.id != player.id])
                player.portal_cooldown_until = 0
                player.hp = 140 if player.is_zombie else 100 + player.upgrades["vitality"] * 20
                player.armor = 0
                player.cover_exposed_until = 0
                player.energy = START_ENERGY
                player.invincible_until = now + SPAWN_INVINCIBILITY
            player.energy = min(100.0, player.energy + ENERGY_REGEN_RATE_PER_SECOND * dt)
            if player.is_bot:
                _choose_bot_input(room, player, now)
            if not room.winner:
                _move_player(room, player, dt, now)
                _spawn_projectile(room, player, now)
        if not room.winner:
            _collect_pickups(room, now)
            _collect_resources(room, now)
            _update_flags(room, now)
            _advance_projectiles(room, dt, now)
        simulation_ms = (time.perf_counter() - tick_work_started) * 1000
        state_interval = _room_state_interval(len(humans))
        if next_state_broadcast <= 0:
            next_state_broadcast = now
        broadcast_ms = 0.0
        if now >= next_state_broadcast:
            broadcast_started = time.perf_counter()
            await broadcast(room)
            broadcast_ms = (time.perf_counter() - broadcast_started) * 1000
            next_state_broadcast += state_interval
            if next_state_broadcast <= now:
                next_state_broadcast = now + state_interval
        _record_room_tick_profile(room, wake_late_ms, simulation_ms, broadcast_ms)


def _new_code():
    while True:
        candidate = secrets.token_hex(3).upper()
        if candidate not in rooms:
            return candidate


def _clean_name(value):
    name = "".join(c for c in str(value or "Rifter") if c.isalnum() or c in " -_")[:18].strip()
    return name or "Rifter"


@router.get("/api/arena/maps")
def arena_maps():
    return [{"id": key, **value} for key, value in MAPS.items()]


@router.get("/api/arena/modes")
def arena_modes():
    return [{"id": key, "name": value["name"], "teams": value["teams"],
             "flags": value["flags"], "zombies": value["zombies"],
             "capacity": room_capacity(key)}
            for key, value in MODES.items()]


@router.get("/api/arena/rooms")
def active_rooms():
    return sorted((room_card(room) for room in rooms.values()
                   if not room.winner and any(not p.is_bot for p in room.players.values())),
                  key=lambda room: (-room["players"], room["code"]))[:30]


@router.websocket("/ws/arena/lobby")
async def arena_lobby_socket(socket: WebSocket):
    origin = socket.headers.get("origin")
    host = socket.headers.get("host")
    if origin and host and urlsplit(origin).netloc.lower() != host.lower():
        await socket.close(code=1008)
        return
    await socket.accept()
    lobby_sockets.add(socket)
    await socket.send_json({"type": "history", "messages": list(lobby_messages)})
    last_message_at = 0.0
    try:
        while True:
            message = await socket.receive_json()
            if not isinstance(message, dict) or message.get("type") != "chat":
                continue
            now = time.monotonic()
            if now - last_message_at < LOBBY_CHAT_INTERVAL:
                await socket.send_json({"type": "error", "message": "Please wait before sending another lobby message."})
                continue
            content = " ".join(str(message.get("content", "")).split())[:180]
            if not content:
                continue
            global lobby_message_id
            lobby_message_id += 1
            row = {
                "id": lobby_message_id,
                "name": _clean_name(message.get("name")),
                "content": content,
                "at": time.time(),
            }
            lobby_messages.append(row)
            stale = []
            for peer in tuple(lobby_sockets):
                try:
                    await peer.send_json({"type": "chat", "message": row})
                except Exception:
                    stale.append(peer)
            for peer in stale:
                lobby_sockets.discard(peer)
            last_message_at = now
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        lobby_sockets.discard(socket)


@router.websocket("/ws/arena")
async def arena_socket(socket: WebSocket):
    origin = socket.headers.get("origin")
    host = socket.headers.get("host")
    if origin and host and urlsplit(origin).netloc.lower() != host.lower():
        await socket.close(code=1008)
        return
    await socket.accept()
    player = None
    room = None
    spectator_id = None
    try:
        hello = await asyncio.wait_for(socket.receive_json(), timeout=12)
        if not isinstance(hello, dict) or hello.get("type") != "join":
            await socket.close(code=1008)
            return
        spectator_mode = bool(hello.get("spectator"))
        requested = "".join(c for c in str(hello.get("room", "")).upper() if c.isalnum())[:8]
        map_id = hello.get("map", "tidal")
        if map_id not in MAPS:
            map_id = "tidal"
        mode_id = hello.get("mode", "normal")
        if mode_id not in MODES:
            mode_id = "normal"
        async with rooms_lock:
            if spectator_mode and not requested:
                await socket.send_json({"type": "error", "message": "Enter a room code to spectate."})
                await socket.close(code=1008)
                return
            code = requested or _new_code()
            room = rooms.get(code)
            if spectator_mode:
                if not room:
                    await socket.send_json({"type": "error", "message": "That room is no longer open."})
                    await socket.close(code=1008)
                    return
                if room.winner:
                    await socket.send_json({"type": "error", "message": "This match has ended."})
                    await socket.close(code=1008)
                    return
                spectator_id = "spectator-" + secrets.token_hex(4)
                room.spectator_sockets[spectator_id] = socket
                if not room.task or room.task.done():
                    room.task = asyncio.create_task(run_room(room))
            else:
                created = room is None
                if not room:
                    room = rooms[code] = Room(code=code, map_id=map_id, mode=mode_id)
                    _make_flags(room)
                    _make_pickups(room)
                    _make_resources(room)
                humans = [p for p in room.players.values() if not p.is_bot]
                capacity = room_capacity(room.mode)
                if len(humans) >= capacity:
                    await socket.send_json({"type": "error", "message": "This room is full."})
                    await socket.close(code=1008)
                    return
                spawn_x, spawn_y = safe_spawn(room.map_id, room.players.values())
                team = _assign_team(room)
                hue = (("#55caff", "#ff8b69")[team] if room.mode in {"team_dm", "ctf"}
                       else PLAYER_COLORS[len(humans) % len(PLAYER_COLORS)])
                requested_skin = hello.get("skin")
                skin = (requested_skin if isinstance(requested_skin, str) and
                        requested_skin in PLAYER_SKINS else "wayfinder")
                player = Player(
                    id=secrets.token_urlsafe(7), name=_clean_name(hello.get("name")),
                    x=spawn_x, y=spawn_y, skin=skin,
                    hue=hue, team=team, lives=5 if room.mode == "duel" else 0,
                )
                room.players[player.id] = player
                room.sockets[player.id] = socket
                if created:
                    _populate_bots(room)
                if not room.task or room.task.done():
                    room.task = asyncio.create_task(run_room(room))
        if spectator_mode:
            await socket.send_json({
                **room_view(room, None), "type": "welcome", "id": spectator_id,
                "spectator": True, "maps": MAPS, "weapons": WEAPONS,
            })
        else:
            await socket.send_json({
                **room_view(room, player.id), "type": "welcome", "id": player.id,
                "maps": MAPS, "weapons": WEAPONS,
            })
        await broadcast(room)
        while True:
            message = await socket.receive_json()
            if not isinstance(message, dict):
                continue
            now = time.monotonic()
            kind = message.get("type")
            if spectator_mode:
                if kind == "ping" and _finite(message.get("sent")):
                    await socket.send_json({"type": "pong", "sent": message["sent"]})
                continue
            player.last_input = now
            if kind == "ping":
                sent = message.get("sent")
                if _finite(sent):
                    await socket.send_json({"type": "pong", "sent": sent})
            elif kind == "vote_map":
                map_id = message.get("map")
                if isinstance(map_id, str) and _record_map_vote(room, player.id, map_id, now):
                    await broadcast(room)
                elif isinstance(map_id, str) and map_id in MAPS and room.winner:
                    await broadcast(room)
            elif kind == "input":
                mx, my = message.get("x", 0), message.get("y", 0)
                ax, ay = message.get("aim_x", player.aim_x), message.get("aim_y", player.aim_y)
                if all(_finite(v) for v in (mx, my, ax, ay)):
                    player.move_x = max(-1, min(1, float(mx)))
                    player.move_y = max(-1, min(1, float(my)))
                    player.aim_x = max(0, min(WIDTH, float(ax)))
                    player.aim_y = max(0, min(HEIGHT, float(ay)))
                player.firing = bool(message.get("fire"))
                player.aiming = bool(message.get("aiming"))
                player.alternate_fire = bool(message.get("alt_fire"))
                if not player.aiming:
                    player.aim_started = 0
            elif kind == "weapon" and message.get("weapon") in player.owned_weapons:
                player.weapon = message["weapon"]
                player.aim_started = 0
                player.switch_until = now + WEAPON_SWITCH_DELAY
            elif kind == "reload":
                _reload(player, now)
            elif kind == "ability":
                ability = message.get("ability")
                if ability in {"dash", "shield", "repair"}:
                    _use_ability(room, player, ability, now)
            elif kind == "upgrade" and message.get("upgrade") in UPGRADES:
                upgrade = message["upgrade"]
                if player.score >= 200 and player.upgrades[upgrade] < 3:
                    player.score -= 200
                    player.upgrades[upgrade] += 1
                    if upgrade == "vitality":
                        player.hp = min(160, player.hp + 25)
            elif kind == "chat":
                content = " ".join(str(message.get("content", "")).split())[:180]
                if content:
                    add_feed(room, f"{player.name}: {content}")
            # Position, projectile creation, damage, score, and eliminations are
            # intentionally never accepted from the client.
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        if room and spectator_id:
            async with rooms_lock:
                room.spectator_sockets.pop(spectator_id, None)
                humans = [p for p in room.players.values() if not p.is_bot]
                if humans:
                    await broadcast(room)
                elif rooms.get(room.code) is room:
                    rooms.pop(room.code, None)
                    if room.task and not room.task.done():
                        room.task.cancel()
        elif room and player:
            async with rooms_lock:
                drop_flag(room, player, time.monotonic())
                room.players.pop(player.id, None)
                room.sockets.pop(player.id, None)
                humans = [p for p in room.players.values() if not p.is_bot]
                if humans:
                    await broadcast(room)
                else:
                    for spectator in tuple(room.spectator_sockets.values()):
                        try:
                            await spectator.close(code=1001)
                        except Exception:
                            pass
                    room.spectator_sockets.clear()
                    rooms.pop(room.code, None)
                    if room.task and not room.task.done():
                        room.task.cancel()
