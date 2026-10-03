"""Compare the local Morrow Fields weapon table with the recorded public values."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.arena import (
    FIELD_UNIT_PX,
    HOMING_TURN_SCALE,
    MISSILE_KINDS,
    MISSILE_SPEED_SCALE,
    PLAYER_SPEED_SCALE,
    PROJECTILE_SPEED_SCALE,
    WEAPONS,
)


SOURCE = ROOT / "output" / "arena-validation" / "slay-public-weapon-config.json"
OUTPUT = ROOT / "output" / "arena-validation" / "weapon-parity-check.json"


def close(actual, expected, tolerance=1e-6):
    return abs(float(actual) - float(expected)) <= tolerance


def main():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    rows = []
    checks = []
    for reference in source["weapons"]:
        local_key = reference["local_key"]
        local = WEAPONS[local_key]
        fields = {
            "cooldown": close(local["cooldown"], reference["cooldown_ticks"] / 20),
            "damage": close(local["damage"], abs(reference["damage"])),
            "speed": close(local["speed"], reference["projectile_speed_field_per_tick"] * 20 * FIELD_UNIT_PX),
            "ammo_size": close(local["ammo_size"], reference["ammo_size"]),
        }
        if reference.get("clip_size") is None:
            fields["clip_not_defined_in_reference"] = local["clip"] < 0
        else:
            fields["clip"] = close(local["clip"], reference["clip_size"])
        if "mode2_cooldown_ticks" in reference:
            fields["reload_cooldown"] = close(local["reload"], reference["mode2_cooldown_ticks"] / 20)
        if "lifetime_ticks" in reference:
            fields["lifetime"] = close(local["life"], reference["lifetime_ticks"] / 20)
        if "projectiles" in reference:
            fields["projectile_count"] = local.get("projectiles", 1) == reference["projectiles"]
        if "spread_radians" in reference:
            fields["spread"] = close(local["spread"], reference["spread_radians"])
        if "damage_loss_per_range" in reference:
            fields["damage_falloff"] = close(local.get("falloff", 0), reference["damage_loss_per_range"])
        if "reflections" in reference:
            fields["reflections"] = local.get("bounces", 0) == reference["reflections"]
        if "required_stand_ticks" in reference:
            fields["aim_charge"] = close(local.get("charge", 0), reference["required_stand_ticks"] / 20)
        if "self_heal" in reference:
            fields["self_heal"] = close(local["self_heal"], reference["self_heal"])
        if "auto_aim_range_field" in reference:
            fields["auto_aim_range"] = close(
                local["auto_aim_range"] / FIELD_UNIT_PX, reference["auto_aim_range_field"]
            )
        if "range_field" in reference:
            fields["range"] = close(local["range"] / FIELD_UNIT_PX, reference["range_field"])
        if "aoe_field" in reference:
            fields["aoe"] = close(local["blast"] / FIELD_UNIT_PX, reference["aoe_field"])
        if "turn_radius" in reference:
            fields["turn"] = close(local["turn"] / 20, reference["turn_radius"])
        alternate = reference.get("alternate")
        if alternate:
            alt = local["alternate"]
            fields["alternate_damage"] = close(alt["damage"], alternate["damage"])
            fields["alternate_speed"] = close(
                alt["speed"], alternate["projectile_speed_field_per_tick"] * 20 * FIELD_UNIT_PX
            )
            fields["alternate_lifetime"] = close(alt["life"], alternate["lifetime_ticks"] / 20)
            fields["alternate_aoe"] = close(alt["blast"] / FIELD_UNIT_PX, alternate["aoe_field"])
            fields["alternate_combo_damage"] = close(alt["combo_damage"], alternate["combo_damage"])
            fields["alternate_combo_aoe"] = close(
                alt["combo_blast"] / FIELD_UNIT_PX, alternate["combo_aoe_field"]
            )
        passed = all(fields.values())
        checks.append(passed)
        rows.append({
            "official_id": reference["official_id"],
            "official_name": reference["official_name"],
            "local_key": local_key,
            "passed": passed,
            "runtime_speed_multiplier": PROJECTILE_SPEED_SCALE *
            (MISSILE_SPEED_SCALE if local["kind"] in MISSILE_KINDS else 1),
            "runtime_homing_turn_multiplier": HOMING_TURN_SCALE if local.get("turn") else None,
            "fields": fields,
        })
    result = {
        "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "field_unit_px": FIELD_UNIT_PX,
        "runtime_balance_scales": {
            "player_movement": PLAYER_SPEED_SCALE,
            "projectiles": PROJECTILE_SPEED_SCALE,
            "missiles_additional": MISSILE_SPEED_SCALE,
            "homing_turn_rate": HOMING_TURN_SCALE,
        },
        "source_table_passed": all(checks),
        "note": "Source values are retained in the weapon table; user-requested runtime pacing scales are listed separately.",
        "weapon_count": len(rows),
        "passed": all(checks),
        "weapons": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
