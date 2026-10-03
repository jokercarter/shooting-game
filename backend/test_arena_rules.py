import asyncio
import math
import time

import pytest
from fastapi.testclient import TestClient

from backend import arena
from backend.arena_public import app as public_app


def make_player(player_id, *, x=200, y=200, hp=100, team=0, zombie=False, bot=False, **kwargs):
    return arena.Player(
        id=player_id,
        name=player_id,
        x=x,
        y=y,
        hue="#ffffff",
        hp=hp,
        team=team,
        is_zombie=zombie,
        is_bot=bot,
        invincible_until=0,
        **kwargs,
    )


@pytest.mark.parametrize("mode,capacity", arena.ROOM_CAPACITIES.items())
def test_room_capacity_is_published_in_state_and_room_list(mode, capacity):
    room = arena.Room(code="CAPACITY", map_id="tidal", mode=mode)

    assert arena.room_capacity(mode) == capacity
    assert arena.room_view(room)["capacity"] == capacity
    assert arena.room_card(room)["capacity"] == capacity


def test_world_is_larger_while_client_camera_scale_stays_a_view_setting():
    assert (arena.WIDTH, arena.HEIGHT) == (3000, 2000)
    assert arena.MAP_SCALE == pytest.approx(3.125)


def test_obstacle_layout_uses_many_short_chunks_instead_of_only_long_walls():
    for map_id, map_def in arena.MAPS.items():
        assert len(map_def["obstacles"]) >= 20, map_id
        assert any(width < 180 and height < 180 for _, _, width, height in map_def["obstacles"])


def test_river_blocks_foot_movement_but_bridge_is_walkable():
    water = arena.MAPS["tidal"]["water"][0]
    bridge = arena.MAPS["tidal"]["bridges"][0]
    water_point = (water[0] + water[2] / 2, water[1] + water[3] * .78)
    bridge_point = (bridge[0] + bridge[2] / 2, bridge[1] + bridge[3] / 2)

    assert arena.in_water("tidal", *water_point)
    assert arena.collides("tidal", *water_point)
    assert not arena.in_water("tidal", *bridge_point)
    assert not arena.collides("tidal", *bridge_point)


def test_map_vote_starts_a_new_round_in_the_same_room():
    now = time.monotonic()
    room = arena.Room(code="MAP-VOTE", map_id="tidal", mode="normal")
    first = make_player("first", x=200, y=200, score=300)
    second = make_player("second", x=340, y=200, score=200)
    room.players = {first.id: first, second.id: second}
    arena._make_pickups(room)
    room.winner = first.id

    assert arena._record_map_vote(room, first.id, "glass", now) is False
    assert room.winner == first.id
    assert arena._record_map_vote(room, second.id, "glass", now) is True

    assert room.winner is None
    assert room.map_id == "glass"
    assert room.team_scores == {"0": 0, "1": 0}
    assert len(room.pickups) == 14
    assert all(player.score == 0 and player.kills == 0 and player.deaths == 0
               for player in room.players.values())
    assert all(player.dead_until == 0 for player in room.players.values())


def test_map_vote_timeout_starts_a_round_with_the_current_map_on_a_tie():
    now = time.monotonic()
    room = arena.Room(code="MAP-VOTE-TIMEOUT", map_id="tidal", mode="normal")
    first = make_player("first", x=200, y=200)
    second = make_player("second", x=340, y=200)
    room.players = {first.id: first, second.id: second}
    arena._make_pickups(room)
    room.winner = first.id
    room.map_votes = {first.id: "glass", second.id: "ember"}
    room.map_vote_deadline = now - .1

    assert arena._complete_map_vote(room, now) is True
    assert room.winner is None
    assert room.map_id == "tidal"


def test_websocket_map_vote_restarts_the_same_room_after_all_humans_vote():
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena") as first:
            first.send_json({"type": "join", "name": "VoteOne", "map": "tidal", "mode": "normal"})
            welcome_first = first.receive_json()
            code = welcome_first["room"]
            with client.websocket_connect("/ws/arena") as second:
                second.send_json({"type": "join", "name": "VoteTwo", "room": code,
                                  "map": "tidal", "mode": "normal"})
                second.receive_json()
                first.receive_json()
                second.receive_json()
                room = arena.rooms[code]
                room.winner = welcome_first["id"]
                room.map_vote_deadline = time.monotonic() + 15
                first.send_json({"type": "vote_map", "map": "glass"})
                first.receive_json()
                second.send_json({"type": "vote_map", "map": "glass"})

                restarted = None
                for _ in range(12):
                    message = second.receive_json()
                    if message.get("type") == "state" and message.get("winner") is None:
                        restarted = message
                        break

    assert restarted is not None
    assert restarted["map"] == "glass"
    assert restarted["team_scores"] == {"0": 0, "1": 0}
    assert all(player["score"] == 0 for player in restarted["players"])


def test_knockback_into_water_causes_an_immediate_fall_death():
    now = time.monotonic()
    room = arena.Room(code="RIVER-KNOCKBACK", map_id="glass")
    player = make_player("pilot", x=1200, y=1320)
    player.knockback_y = 1000
    player.knockback_until = now + 1
    room.players[player.id] = player

    arena._move_player(room, player, .1, now)

    assert player.dead_until > now
    assert any("fell into the river" in item["content"] for item in room.feed)


def test_state_update_rate_drops_only_after_a_room_becomes_crowded():
    room = arena.Room(code="RATE", map_id="tidal", mode="normal")
    assert arena.room_view(room)["state_interval_ms"] == 50

    for index in range(arena.STATE_SHARED_VIEW_THRESHOLD):
        player = make_player(f"pilot-{index}")
        room.players[player.id] = player

    assert arena.room_view(room)["state_interval_ms"] == round(1000 * arena.FAST_TICK_RATE)
    assert arena._room_tick_rate(arena.STATE_SHARED_VIEW_THRESHOLD) == arena.FAST_TICK_RATE
    assert arena.FAST_TICK_RATE == pytest.approx(1 / 90)
    assert arena.room_view(room)["state_interval_ms"] == 11

    for index in range(arena.STATE_SHARED_VIEW_THRESHOLD, arena.STATE_CROWD_THRESHOLD):
        player = make_player(f"crowd-{index}")
        room.players[player.id] = player

    assert arena.room_view(room)["state_interval_ms"] == 100
    assert arena._room_tick_rate(arena.STATE_CROWD_THRESHOLD) == arena.TICK_RATE


def test_compact_public_players_keep_dynamic_fields_and_drop_static_duplicates():
    room = arena.Room(code="COMPACT", map_id="tidal", mode="normal")
    for index in range(arena.STATE_SHARED_VIEW_THRESHOLD):
        player = make_player(f"pilot-{index}", x=220 + index * 30)
        room.players[player.id] = player

    snapshot = arena._state_snapshot(room)
    full_players = arena.room_view(room, None, snapshot)["players"]
    compact_players = arena._compact_public_players(full_players)

    assert len(compact_players) == len(full_players)
    assert {"id", "x", "y", "hp", "weapon", "score"} <= set(compact_players[0])
    assert "name" not in compact_players[0]
    assert "skin" not in compact_players[0]
    assert "ammo" not in compact_players[0]


def test_public_modes_api_publishes_human_capacity():
    with TestClient(public_app) as client:
        response = client.get("/api/arena/modes")

    assert response.status_code == 200
    capacities = {item["id"]: item["capacity"] for item in response.json()}
    assert capacities == arena.ROOM_CAPACITIES

    modes = {item["id"]: item for item in response.json()}
    assert modes["team_dm"]["teams"] is True
    assert modes["team_dm"]["zombies"] is False
    assert modes["zombie_coop"]["zombies"] is True


def test_weapon_slots_cover_all_fifteen_controls_and_energy_alt_fire():
    slots = {weapon["slot"]: key for key, weapon in arena.WEAPONS.items()}

    assert len(arena.WEAPONS) == len(slots) == 15
    assert {"H": "healing_wave", "J": "energy_sniper", "L": "bug"}.items() <= slots.items()
    assert arena.WEAPONS["energy_sniper"]["alternate"]["kind"] == "energy_orb"
    assert arena.WEAPONS["energy_sniper"]["alternate"]["combo_damage"] == 100


def test_reference_weapon_numbers_are_scaled_into_local_units():
    assert arena.WEAPONS["pulse"]["cooldown"] == 17 / 20
    assert arena.WEAPONS["pulse"]["speed"] == .75 * 20 * arena.FIELD_UNIT_PX
    assert arena.WEAPONS["flame"]["speed"] == .45 * 20 * arena.FIELD_UNIT_PX
    assert arena.WEAPONS["seeker"]["turn"] == .16 * 20
    assert arena.WEAPONS["healing_wave"]["clip"] == 40
    assert arena.WEAPONS["healing_wave"]["ammo_size"] == 100
    assert arena.WEAPONS["energy_sniper"]["damage"] == 20
    assert arena.WEAPONS["energy_sniper"]["alternate"]["damage"] == 45


def test_player_and_projectile_speeds_use_requested_runtime_pacing_scales():
    now = time.monotonic()
    assert arena.PLAYER_SPEED_SCALE == pytest.approx(.84)
    room = arena.Room(code="SPEED-SCALE", map_id="tidal")
    player = make_player("pilot", x=200, y=200)
    player.move_x = 1
    player.last_input = now
    arena._move_player(room, player, .1, now)
    assert player.x - 200 == pytest.approx(192 * arena.PLAYER_SPEED_SCALE * .1)

    projectile_speeds = {}
    for key in ("pulse", "seeker"):
        shooter = make_player(f"shoot-{key}", x=200, y=200)
        room.players = {shooter.id: shooter}
        shooter.weapon = key
        shooter.aim_x, shooter.aim_y = 800, 200
        shooter.firing = True
        shooter.ammo[key] = {"mag": 1, "reserve": 1, "reload_until": 0}
        arena._spawn_projectile(room, shooter, now + 2)
        projectile = room.projectiles[-1]
        projectile_speeds[key] = math.hypot(projectile["vx"], projectile["vy"])
        room.projectiles.clear()

    assert projectile_speeds["pulse"] == pytest.approx(
        arena.WEAPONS["pulse"]["speed"] * arena.PROJECTILE_SPEED_SCALE
    )
    assert projectile_speeds["seeker"] == pytest.approx(
        arena.WEAPONS["seeker"]["speed"] * arena.PROJECTILE_SPEED_SCALE * arena.MISSILE_SPEED_SCALE
    )


def test_homing_turn_rate_uses_the_lower_runtime_tracking_scale():
    room = arena.Room(code="TURN-SCALE", map_id="tidal")
    owner = make_player("pilot", x=200, y=200)
    room.players[owner.id] = owner
    projectile = {
        "kind": "seeker", "owner": owner.id, "target_id": None,
        "target_x": 200, "target_y": 500, "x": 300, "y": 350,
        "vx": 100, "vy": 0, "turn": arena.WEAPONS["seeker"]["turn"] * arena.HOMING_TURN_SCALE,
    }

    arena._steer(room, projectile, .05)

    angle = math.atan2(projectile["vy"], projectile["vx"])
    assert angle == pytest.approx(arena.WEAPONS["seeker"]["turn"] *
                                  arena.HOMING_TURN_SCALE * .05)


@pytest.mark.parametrize("map_id", arena.MAPS)
def test_dense_room_spawn_stays_outside_walls(map_id):
    players = [make_player(str(index), x=480, y=320) for index in range(42)]

    x, y = arena.safe_spawn(map_id, players)

    assert not arena.collides(map_id, x, y)


@pytest.mark.parametrize("map_id", arena.MAPS)
def test_weapon_pickups_use_fixed_marked_points_and_stay_bound_to_the_same_weapon(map_id):
    room = arena.Room(code="FIXED-PICKUPS", map_id=map_id)
    arena._make_pickups(room)
    points = arena.MAPS[map_id]["pickup_points"]

    assert len(points) == 14
    assert {point[2] for point in points} == {
        key for key, weapon in arena.WEAPONS.items() if weapon["pickup"] > 0
    }
    assert [(item["x"], item["y"], item["weapon"]) for item in room.pickups] == [tuple(point) for point in points]
    assert all(not arena.collides(map_id, item["x"], item["y"], 12)
               for item in room.pickups)
    assert all(item["respawn_at"] == 0 for item in room.pickups)


def test_pickup_state_keeps_an_unavailable_ground_marker_and_respawn_countdown():
    room = arena.Room(code="PICKUP-MARKER", map_id="tidal")
    arena._make_pickups(room)
    now = time.monotonic()
    room.pickups[0]["respawn_at"] = now + 12

    view = arena.room_view(room)

    marker = next(item for item in view["pickup_spawns"] if item["id"] == room.pickups[0]["id"])
    assert marker["available"] is False
    assert marker["weapon"] == room.pickups[0]["weapon"]
    assert marker["respawn_in"] > 0
    assert all(item["id"] != room.pickups[0]["id"] for item in view["pickups"])


def test_projectile_state_contains_render_fields_but_hides_simulation_fields():
    room = arena.Room(code="PROJECTILE-VIEW", map_id="tidal")
    room.projectiles = [{
        "id": 17, "owner": "pilot", "weapon": "seeker", "age": .25,
        "x": 400.123, "y": 500.456, "vx": 12.345, "vy": -67.891,
        "total_life": 2.5, "kind": "seeker", "blast": 60, "color": "#f0d15f",
        "damage": 50, "target_id": "hidden-target", "hit_targets": ["a", "b"],
        "turn": 1.12, "self_damage": True, "knockback": 720,
        "distance_travelled": 42.5, "max_range": 900,
    }]

    projectile = arena.room_view(room)["projectiles"][0]

    assert projectile == {
        "id": 17, "owner": "pilot", "weapon": "seeker", "age": .25,
        "x": 400.12, "y": 500.46, "vx": 12.35, "vy": -67.89,
        "total_life": 2.5, "kind": "seeker", "blast": 60,
        "color": "#f0d15f", "damage": 50,
    }


@pytest.mark.parametrize(("score", "points"), [(0, 0), (199, 0), (200, 1), (450, 2)])
def test_available_skill_points_reflect_unspent_score(score, points):
    player = make_player("pilot", score=score)
    view = arena.player_view(player, "tidal", viewer_id=player.id)
    assert view["skill_points"] == points


def test_player_view_publishes_remaining_reload_time_only_to_the_owner():
    now = time.monotonic()
    player = make_player("reload-owner")
    player.weapon = "lobber"
    player.ammo["lobber"]["reload_until"] = now + 1.25

    owner_view = arena.player_view(player, "tidal", viewer_id=player.id, now=now)
    observer_view = arena.player_view(player, "tidal", viewer_id="other", now=now)

    assert owner_view["ammo"]["lobber"]["reload_remaining"] == pytest.approx(1.25)
    assert "reload_remaining" not in observer_view["ammo"].get("lobber", {})


def test_player_view_keeps_loadout_private_and_publishes_remote_max_health():
    player = make_player("private-loadout")
    player.owned_weapons.add("lobber")
    player.upgrades["vitality"] = 2

    owner_view = arena.player_view(player, "tidal", viewer_id=player.id)
    observer_view = arena.player_view(player, "tidal", viewer_id="other")

    assert "lobber" in owner_view["owned_weapons"]
    assert owner_view["upgrades"]["vitality"] == 2
    assert observer_view["owned_weapons"] == []
    assert observer_view["upgrades"] is None
    assert observer_view["max_hp"] == 140


def test_abilities_use_server_energy_and_state_publishes_energy():
    now = time.monotonic()
    room = arena.Room(code="ENERGY", map_id="tidal", mode="normal")
    player = make_player("pilot", energy=40)
    room.players[player.id] = player

    assert arena._use_ability(room, player, "shield", now) is True
    assert player.energy == 7
    assert player.shield_until > now
    player.next_shield = 0
    assert arena._use_ability(room, player, "shield", now) is False
    assert player.energy == 7
    view = arena.player_view(player, room.map_id, player.id)
    assert view["energy"] == 7

    player.energy = 0
    player.next_repair = 0
    assert arena._use_ability(room, player, "repair", now) is False


def test_websocket_energy_is_private_and_regenerates_between_states():
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena") as first:
            first.send_json({"type": "join", "name": "EnergyOne", "map": "tidal",
                             "mode": "normal"})
            welcome_first = first.receive_json()
            assert welcome_first["type"] == "welcome"
            assert next(p for p in welcome_first["players"]
                        if p["id"] == welcome_first["id"])["energy"] == arena.START_ENERGY

            with client.websocket_connect("/ws/arena") as second:
                second.send_json({"type": "join", "name": "EnergyTwo",
                                  "room": welcome_first["room"], "map": "tidal",
                                  "mode": "normal"})
                welcome_second = second.receive_json()
                assert welcome_second["type"] == "welcome"
                second_id = welcome_second["id"]
                first_id = welcome_first["id"]
                assert next(p for p in welcome_second["players"]
                            if p["id"] == second_id)["energy"] == arena.START_ENERGY

                observed_regeneration = False
                for _ in range(24):
                    state = second.receive_json()
                    if state.get("type") != "state":
                        continue
                    own = next(p for p in state["players"] if p["id"] == second_id)
                    peer = next(p for p in state["players"] if p["id"] == first_id)
                    assert own["energy"] is not None
                    assert peer["energy"] is None
                    if own["energy"] > arena.START_ENERGY:
                        observed_regeneration = True
                        break

                assert observed_regeneration


def test_spectator_join_receives_live_state_without_consuming_a_player_slot():
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena") as player_socket:
            player_socket.send_json({"type": "join", "name": "Pilot", "map": "tidal", "mode": "duel"})
            player_welcome = player_socket.receive_json()
            room_code = player_welcome["room"]
            player_id = player_welcome["id"]

            with client.websocket_connect("/ws/arena") as spectator_socket:
                spectator_socket.send_json({"type": "join", "room": room_code,
                                             "map": "tidal", "mode": "duel", "spectator": True})
                spectator_welcome = spectator_socket.receive_json()
                assert spectator_welcome["type"] == "welcome"
                assert spectator_welcome["spectator"] is True
                assert spectator_welcome["id"] not in {player["id"] for player in spectator_welcome["players"]}
                assert any(player["id"] == player_id for player in spectator_welcome["players"])
                assert spectator_welcome["capacity"] == arena.ROOM_CAPACITIES["duel"]
                state = spectator_socket.receive_json()
                assert state["type"] == "state"

            assert room_code in arena.rooms
            assert arena.rooms[room_code].spectator_sockets == {}


def test_two_kills_award_one_spendable_skill_point():
    now = time.monotonic()
    room = arena.Room(code="SKILL", map_id="tidal", mode="normal")
    source = make_player("source")
    first = make_player("first", hp=1)
    second = make_player("second", hp=1)
    room.players = {p.id: p for p in (source, first, second)}

    arena._hurt(room, source, first, 1, now)
    arena._hurt(room, source, second, 1, now)

    view = arena.player_view(source, room.map_id, source.id)
    assert source.score == 200
    assert view["skill_points"] == 1


@pytest.mark.parametrize(("requested", "expected"), [
    ("orchard", "orchard"),
    ("ember", "ember"),
    ("unknown", "wayfinder"),
    ({"skin": "gear"}, "wayfinder"),
])
def test_websocket_skin_selection_is_allowlisted(requested, expected):
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena") as socket:
            socket.send_json({"type": "join", "name": "SkinCheck", "map": "tidal",
                              "mode": "duel", "skin": requested})
            welcome = socket.receive_json()

    player = next(player for player in welcome["players"] if player["id"] == welcome["id"])
    assert welcome["type"] == "welcome"
    assert player["skin"] == expected


def test_websocket_upgrade_spends_skill_point_and_broadcasts_state():
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena") as socket:
            socket.send_json({"type": "join", "name": "UpgradeCheck", "map": "tidal",
                              "mode": "duel", "skin": "wayfinder"})
            welcome = socket.receive_json()
            assert welcome["type"] == "welcome"
            player = arena.rooms[welcome["room"]].players[welcome["id"]]
            player.score = 200
            socket.send_json({"type": "upgrade", "upgrade": "vitality"})

            updated = None
            for _ in range(12):
                message = socket.receive_json()
                if message.get("type") != "state":
                    continue
                current = next(p for p in message["players"] if p["id"] == welcome["id"])
                if current["skill_points"] == 0 and current["upgrades"]["vitality"] == 1:
                    updated = current
                    break

    assert updated is not None
    assert updated["score"] == 0
    assert updated["hp"] == 125


def test_lobby_chat_broadcasts_sanitized_names_to_all_lobby_clients():
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena/lobby") as first:
            first_history = first.receive_json()
            assert first_history["type"] == "history"
            with client.websocket_connect("/ws/arena/lobby") as second:
                second_history = second.receive_json()
                assert second_history["type"] == "history"
                first.send_json({"type": "chat", "name": "Pilot! One", "content": "hello <team>"})
                sent = first.receive_json()
                received = second.receive_json()
                first.send_json({"type": "chat", "name": "Pilot! One", "content": "too soon"})
                throttled = first.receive_json()
                second.send_json({"type": "chat", "name": "Observer", "content": "x" * 240})
                long_from_first = first.receive_json()
                long_from_second = second.receive_json()

    assert sent["type"] == received["type"] == "chat"
    assert sent["message"] == received["message"]
    assert sent["message"]["name"] == "Pilot One"
    assert sent["message"]["content"] == "hello <team>"
    assert throttled["type"] == "error"
    assert "wait" in throttled["message"].lower()
    assert long_from_first["type"] == long_from_second["type"] == "chat"
    assert long_from_first["message"]["content"] == "x" * 180


@pytest.mark.parametrize("weapon_key, weapon", arena.WEAPONS.items())
def test_every_weapon_spawns_its_configured_projectile(weapon_key, weapon):
    room = arena.Room(code="WEAPON", map_id="tidal")
    player = make_player("shooter")
    room.players[player.id] = player
    player.weapon = weapon_key
    player.aim_x, player.aim_y = 500, player.y
    player.aiming = True
    player.aim_started = time.monotonic() - 2
    player.firing = True
    player.ammo[weapon_key] = {
        "mag": -1 if weapon["clip"] < 0 else max(1, weapon["clip"]),
        "reserve": -1,
        "reload_until": 0,
    }

    arena._spawn_projectile(room, player, time.monotonic())

    assert len(room.projectiles) == weapon.get("projectiles", 1)
    assert all(p["weapon"] == weapon_key and p["kind"] == weapon["kind"]
               for p in room.projectiles)
    if weapon["kind"] in arena.MISSILE_KINDS and weapon.get("blast", 0):
        assert all(p["self_damage"] for p in room.projectiles)


@pytest.mark.parametrize("weapon_key", [
    key for key, weapon in arena.WEAPONS.items() if weapon["pickup"] > 0
])
def test_every_pickup_weapon_can_be_collected_and_reloaded(weapon_key):
    now = time.monotonic()
    room = arena.Room(code="LOADOUT", map_id="tidal")
    player = make_player("pilot", x=200, y=200)
    room.players[player.id] = player
    room.pickups = [{"id": 1, "x": player.x, "y": player.y,
                     "weapon": weapon_key, "respawn_at": 0}]
    weapon = arena.WEAPONS[weapon_key]
    ammo_size = weapon.get("ammo_size", weapon["pickup"])

    arena._collect_pickups(room, now)
    ammo = player.ammo[weapon_key]
    assert weapon_key in player.owned_weapons
    assert ammo["mag"] == min(ammo_size, weapon["clip"])

    ammo["mag"] = 1
    room.pickups[0]["respawn_at"] = 0
    arena._collect_pickups(room, now + arena.ITEM_RESPAWN)
    reserve_before_reload = ammo["reserve"]
    ammo["mag"] = 0
    player.weapon = weapon_key
    player.aim_x, player.aim_y = 500, player.y
    player.firing = player.aiming = True
    player.aim_started = now - 2
    arena._reload(player, now + arena.ITEM_RESPAWN)

    arena._spawn_projectile(room, player, ammo["reload_until"] + .01)

    loaded = min(weapon["clip"], reserve_before_reload)
    assert ammo["mag"] == loaded - 1
    assert ammo["reserve"] == reserve_before_reload - loaded
    assert any(projectile["weapon"] == weapon_key for projectile in room.projectiles)


@pytest.mark.parametrize("map_id", arena.MAPS)
def test_support_resources_have_clear_spawn_points_and_are_published(map_id):
    room = arena.Room(code="SUPPORT", map_id=map_id)
    arena._make_resources(room)

    assert len(arena.MAPS[map_id]["support_points"]) == 4
    assert {item["kind"] for item in room.resources} == {"health", "armor"}
    assert all(not arena.collides(map_id, item["x"], item["y"], 12)
               for item in room.resources)
    view = arena.room_view(room)
    assert len(view["resource_spawns"]) == 4
    assert len(view["resources"]) == 4
    assert {item["kind"] for item in view["resources"]} == {"health", "armor"}


def test_health_and_armor_resources_restore_the_matching_stat_and_respawn():
    now = time.monotonic()
    room = arena.Room(code="SUPPORT-COLLECT", map_id="tidal")
    player = make_player("pilot", x=200, y=200, hp=55, armor=0)
    room.players[player.id] = player
    room.resources = [
        {"id": 1, "x": player.x, "y": player.y, "kind": "health", "respawn_at": 0},
        {"id": 2, "x": player.x + 80, "y": player.y, "kind": "armor", "respawn_at": 0},
    ]

    arena._collect_resources(room, now)
    assert player.hp == 90
    assert player.armor == 0
    assert room.resources[0]["respawn_at"] == now + arena.RESOURCE_RESPAWN

    player.x += 80
    arena._collect_resources(room, now)
    assert player.armor == 40
    assert room.resources[1]["respawn_at"] == now + arena.RESOURCE_RESPAWN


def test_grass_visibility_allows_same_patch_and_reveals_attackers_or_damaged_players():
    now = time.monotonic()
    patch = arena.MAPS["tidal"]["cover"][0]
    target = make_player("target", x=patch[0] + patch[2] / 2, y=patch[1] + patch[3] / 2)
    outside = make_player("outside", x=1800, y=1800)
    same_patch = make_player("same", x=patch[0] + 8, y=patch[1] + 8)

    hidden_view = arena.player_view(target, "tidal", outside.id, now, outside)
    same_view = arena.player_view(target, "tidal", same_patch.id, now, same_patch)
    assert hidden_view["hidden"] is True
    assert hidden_view["x"] is None and hidden_view["y"] is None
    assert same_view["hidden"] is False
    assert same_view["x"] == round(target.x, 1)

    room = arena.Room(code="GRASS-REVEAL", map_id="tidal")
    room.players = {target.id: target, outside.id: outside}
    target.aim_x, target.aim_y = outside.x, outside.y
    target.firing = True
    arena._spawn_projectile(room, target, now)
    assert target.cover_exposed_until >= now + arena.COVER_EXPOSURE_SECONDS
    exposed_view = arena.player_view(target, "tidal", outside.id, now + .1, outside)
    assert exposed_view["hidden"] is False
    assert exposed_view["cover_exposed"] is True

    target.cover_exposed_until = 0
    arena._hurt(room, outside, target, 12, now + .2)
    assert target.cover_exposed_until >= now + .2 + arena.COVER_EXPOSURE_SECONDS
    damaged_view = arena.player_view(target, "tidal", outside.id, now + .3, outside)
    assert damaged_view["hidden"] is False


@pytest.mark.parametrize("weapon_key", [
    key for key, weapon in arena.WEAPONS.items() if weapon["kind"] != "heal_beam"
])
def test_every_weapon_can_hit_a_visible_target(weapon_key, monkeypatch):
    monkeypatch.setattr(arena.random, "uniform", lambda lower, upper: 0.0)
    now = time.monotonic()
    room = arena.Room(code="HIT", map_id="tidal")
    shooter = make_player("shooter", x=200, y=200)
    target = make_player("target", x=340, y=200)
    room.players = {shooter.id: shooter, target.id: target}
    weapon = arena.WEAPONS[weapon_key]
    shooter.weapon = weapon_key
    shooter.aim_x, shooter.aim_y = target.x, target.y
    shooter.aiming = shooter.firing = True
    shooter.aim_started = now - 2
    shooter.ammo[weapon_key] = {
        "mag": -1 if weapon["clip"] < 0 else max(1, weapon["clip"]),
        "reserve": -1,
        "reload_until": 0,
    }

    arena._spawn_projectile(room, shooter, now)
    for tick in range(40):
        arena._advance_projectiles(room, .05, now + tick * .05)
        if target.hp < 100:
            break

    assert target.hp < 100, f"{weapon_key} did not damage a target in open sight"


def test_heal_beam_heals_allies_and_self_without_damaging_enemies():
    now = time.monotonic()
    room = arena.Room(code="HEAL", map_id="tidal", mode="team_dm")
    source = make_player("source", x=200, y=200, hp=80, team=0)
    ally = make_player("ally", x=240, y=200, hp=55, team=0)
    enemy = make_player("enemy", x=230, y=200, hp=55, team=1)
    room.players = {p.id: p for p in (source, ally, enemy)}
    source.weapon = "healing_wave"
    source.aim_x, source.aim_y = ally.x, ally.y
    source.firing = True
    source.ammo["healing_wave"] = {"mag": 40, "reserve": 60, "reload_until": 0}

    arena._spawn_projectile(room, source, now)
    arena._advance_projectiles(room, .05, now + .05)

    assert source.hp == 84
    assert ally.hp == 60
    assert enemy.hp == 55
    assert source.ammo["healing_wave"]["mag"] == 39
    assert room.projectiles == []


def test_energy_sniper_secondary_fire_uses_server_side_alt_profile():
    room = arena.Room(code="ALT", map_id="tidal")
    player = make_player("shooter")
    room.players[player.id] = player
    player.weapon = "energy_sniper"
    player.alternate_fire = True
    player.aim_x, player.aim_y = 500, player.y
    player.firing = True
    player.ammo["energy_sniper"] = {"mag": 14, "reserve": 14, "reload_until": 0}

    arena._spawn_projectile(room, player, time.monotonic())

    assert len(room.projectiles) == 1
    assert room.projectiles[0]["kind"] == "energy_orb"
    assert room.projectiles[0]["damage"] == 45
    assert room.projectiles[0]["blast"] == 1.4 * arena.FIELD_UNIT_PX
    assert room.projectiles[0]["combo_damage"] == 100
    assert player.ammo["energy_sniper"]["mag"] == 13


def test_energy_ray_detonates_its_orb_for_combo_damage():
    now = time.monotonic()
    room = arena.Room(code="COMBO", map_id="tidal")
    shooter = make_player("shooter", x=200, y=200)
    target = make_player("target", x=340, y=200)
    room.players = {shooter.id: shooter, target.id: target}
    room.projectiles = [
        {"id": 1, "owner": shooter.id, "weapon": "energy_sniper", "kind": "energy_ray",
         "x": 250, "y": 200, "vx": 1800, "vy": 0, "r": 6, "life": .4,
         "total_life": .4, "age": 0, "damage": 20, "blast": 0, "bounces": 0,
         "turn": 0, "pierce": 0, "target_id": None, "hit_targets": [],
         "target_x": 500, "target_y": 200, "color": "#ee6a72"},
        {"id": 2, "owner": shooter.id, "weapon": "energy_sniper", "kind": "energy_orb",
         "x": 300, "y": 200, "vx": 0, "vy": 0, "r": 8.4, "life": 5,
         "total_life": 5, "age": 0, "damage": 45, "blast": 42,
         "combo_damage": 100, "combo_blast": 93, "bounces": 0, "turn": 0,
         "pierce": 0, "target_id": None, "hit_targets": [],
         "target_x": 500, "target_y": 200, "color": "#ee6a72"},
    ]

    arena._advance_projectiles(room, .05, now)

    assert target.hp < 60
    assert room.projectiles == []


def test_websocket_input_broadcasts_second_fire_mode_state():
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena") as socket:
            socket.send_json({"type": "join", "name": "AltFire", "map": "tidal",
                              "mode": "duel"})
            welcome = socket.receive_json()
            socket.send_json({"type": "input", "x": 0, "y": 0, "alt_fire": True})

            updated = None
            for _ in range(12):
                message = socket.receive_json()
                if message.get("type") != "state":
                    continue
                player = next(p for p in message["players"] if p["id"] == welcome["id"])
                if player["alternate_fire"]:
                    updated = player
                    break

    assert updated is not None


def test_rail_pierces_multiple_targets_and_shield_reduces_damage():
    now = time.monotonic()
    room = arena.Room(code="RAIL", map_id="tidal")
    shooter = make_player("shooter", x=200, y=200)
    first = make_player("first", x=300, y=200, hp=100)
    second = make_player("second", x=400, y=200, hp=100)
    room.players = {p.id: p for p in (shooter, first, second)}
    shooter.weapon = "rail"
    shooter.aim_x, shooter.aim_y = 500, shooter.y
    shooter.aiming = shooter.firing = True
    shooter.aim_started = now - 2
    shooter.ammo["rail"] = {"mag": 5, "reserve": 10, "reload_until": 0}

    arena._spawn_projectile(room, shooter, now)
    for tick in range(18):
        arena._advance_projectiles(room, .05, now + tick * .05)

    assert first.hp == 35
    assert second.hp == 35

    protected = make_player("protected", x=500, y=200, shield_until=now + 5)
    room.players[protected.id] = protected
    arena._hurt(room, shooter, protected, 20, now)
    assert protected.hp == 90

    protected.hp = 100
    arena._hurt(room, shooter, protected, 60, now)
    assert protected.hp == 90


def test_right_click_jump_has_a_short_server_side_invulnerability_window():
    now = time.monotonic()
    room = arena.Room(code="JUMP", map_id="tidal")
    source = make_player("source")
    target = make_player("target", x=240, jump_until=now + .4)
    room.players = {source.id: source, target.id: target}

    arena._hurt(room, source, target, 50, now)
    assert target.hp == 100

    target.jump_until = now - .01
    arena._hurt(room, source, target, 50, now)
    assert target.hp == 50


def test_ricochet_projectile_bounces_off_a_wall():
    now = time.monotonic()
    room = arena.Room(code="BOUNCE", map_id="tidal")
    shooter = make_player("shooter")
    room.players[shooter.id] = shooter
    room.projectiles = [{
        "id": 1, "owner": shooter.id, "weapon": "prism", "kind": "ricochet",
        "x": 1400.0, "y": 840.0, "vx": 0.0, "vy": 450.0,
        "r": 4, "life": 5.0, "age": 0.0, "damage": 28,
        "blast": 0, "bounces": 8, "turn": 0, "pierce": 0,
        "hit_targets": [], "target_x": 1400, "target_y": 1100,
    }]

    arena._advance_projectiles(room, .1, now)

    assert len(room.projectiles) == 1
    assert room.projectiles[0]["bounces"] == 7
    assert room.projectiles[0]["vy"] < 0


@pytest.mark.parametrize("kind", ["bolt", "arc"])
def test_projectiles_stop_at_walls_but_pass_through_grass(kind):
    now = time.monotonic()
    wall = next(obstacle for obstacle in arena.MAPS["tidal"]["obstacles"]
                if obstacle[0] == 1369 and obstacle[1] == 869)
    shooter = make_player("shooter", x=wall[0] - 70, y=wall[1] + wall[3] / 2)
    room = arena.Room(code="PROJECTILE-COVER", map_id="tidal")
    room.players[shooter.id] = shooter

    room.projectiles = [{
        "id": 1, "owner": shooter.id, "weapon": "pulse", "kind": kind,
        "x": shooter.x, "y": shooter.y, "vx": 420.0, "vy": 0.0,
        "r": 4, "life": 5.0, "age": 0.0, "damage": 28,
        "blast": 0, "bounces": 0, "turn": 0, "pierce": 0,
        "hit_targets": [], "target_x": 1900, "target_y": shooter.y,
    }]
    arena._advance_projectiles(room, .3, now)
    assert room.projectiles == []

    cover = arena.MAPS["tidal"]["cover"][0]
    room.projectiles = [{
        "id": 2, "owner": shooter.id, "weapon": "pulse", "kind": kind,
        "x": cover[0] - 70, "y": cover[1] + cover[3] / 2, "vx": 420.0, "vy": 0.0,
        "r": 4, "life": 5.0, "age": 0.0, "damage": 28,
        "blast": 0, "bounces": 0, "turn": 0, "pierce": 0,
        "hit_targets": [], "target_x": 800, "target_y": cover[1],
    }]
    arena._advance_projectiles(room, .7, now)
    assert len(room.projectiles) == 1
    assert room.projectiles[0]["x"] > cover[0] + cover[2]


def test_missiles_colliding_detonate_together():
    now = time.monotonic()
    room = arena.Room(code="MISSILE-COLLISION", map_id="tidal")
    first_owner = make_player("first-owner", x=300, y=300)
    second_owner = make_player("second-owner", x=2600, y=1700)
    room.players = {first_owner.id: first_owner, second_owner.id: second_owner}

    def missile(projectile_id, owner, x, velocity):
        return {
            "id": projectile_id, "owner": owner, "weapon": "flare", "kind": "rocket",
            "x": x, "y": 700.0, "vx": velocity, "vy": 0.0, "r": 8.0,
            "life": 5.0, "age": 0.0, "damage": 60.0, "blast": 69.0,
            "bounces": 0, "turn": 0, "pierce": 0, "hit_targets": [],
            "target_x": 2000.0, "target_y": 700.0, "color": "#ff795f",
        }

    first = missile(1, first_owner.id, 1100.0, 400.0)
    second = missile(2, second_owner.id, 1140.0, -400.0)
    room.projectiles = [first, second]

    arena._advance_projectiles(room, .05, now)

    assert first["detonated"] is True
    assert second["detonated"] is True
    assert room.projectiles == []
    assert first["x"] == pytest.approx(second["x"])
    assert first["y"] == pytest.approx(second["y"])


def test_portals_pair_and_preserve_direction_for_players_and_projectiles():
    now = time.monotonic()
    room = arena.Room(code="PORTALS", map_id="glass")
    player = make_player("portal-pilot", x=1500, y=650)
    player.move_y = 1
    room.players[player.id] = player

    arena._move_player(room, player, .5, now)

    north, south = arena.MAPS["glass"]["portals"]
    assert player.y > south["y"]
    assert player.x == pytest.approx(south["x"])

    projectile = {
        "id": 4, "owner": player.id, "weapon": "pulse", "kind": "bolt",
        "x": north["x"], "y": north["y"] - 180, "vx": 0.0, "vy": 500.0,
        "r": 4, "life": 5.0, "age": 0.0, "damage": 28, "blast": 0,
        "bounces": 0, "turn": 0, "pierce": 0, "hit_targets": [],
        "target_x": north["x"], "target_y": south["y"],
    }
    room.projectiles = [projectile]

    arena._advance_projectiles(room, .4, now)

    assert projectile["y"] > south["y"]
    assert projectile["vx"] == 0
    assert projectile["vy"] == 500
    assert len(room.projectiles) == 1


def test_explosion_damage_falls_off_with_distance_and_has_an_edge():
    now = time.monotonic()
    room = arena.Room(code="BLAST", map_id="tidal")
    shooter = make_player("shooter", x=200, y=200)
    near = make_player("near", x=500, y=200)
    middle = make_player("middle", x=560, y=200)
    outside = make_player("outside", x=600, y=200)
    room.players = {p.id: p for p in (shooter, near, middle, outside)}
    projectile = {
        "owner": shooter.id, "x": 500, "y": 200, "damage": 60, "blast": 74,
    }

    arena._blast(room, projectile, now)

    assert near.hp == 40
    assert middle.hp == 80
    assert outside.hp == 100


def test_missile_blast_can_damage_its_owner_and_falls_off_from_the_center():
    now = time.monotonic()
    room = arena.Room(code="SELF-BLAST", map_id="tidal")
    source = make_player("source", x=200, y=200)
    center = make_player("center", x=220, y=200)
    edge = make_player("edge", x=300, y=200)
    room.players = {p.id: p for p in (source, center, edge)}
    projectile = {
        "owner": source.id, "x": 220, "y": 200, "damage": 60,
        "blast": 69, "self_damage": True,
    }

    arena._blast(room, projectile, now)

    assert center.hp < source.hp < edge.hp < 100


def test_charged_rail_waits_until_full_aim_time():
    now = time.monotonic()
    room = arena.Room(code="CHARGE", map_id="tidal")
    player = make_player("shooter")
    room.players[player.id] = player
    player.weapon = "rail"
    player.aim_x, player.aim_y = 500, player.y
    player.aiming = player.firing = True
    player.aim_started = now
    player.ammo["rail"] = {"mag": 5, "reserve": 10, "reload_until": 0}

    arena._spawn_projectile(room, player, now + .99)
    assert room.projectiles == []

    arena._spawn_projectile(room, player, now + 1.01)
    assert len(room.projectiles) == 1
    assert room.projectiles[0]["kind"] == "rail"


def test_homing_missile_cannot_lock_through_wall():
    room = arena.Room(code="SIGHT", map_id="tidal")
    shooter = make_player("shooter", x=1000, y=900)
    target = make_player("target", x=1900, y=900)
    room.players = {shooter.id: shooter, target.id: target}
    assert not arena.has_line_of_sight(room.map_id, shooter.x, shooter.y, target.x, target.y)
    assert arena.has_line_of_sight(room.map_id, 1000, 600, 1900, 600)
    assert arena._nearest_opponent(room, shooter) is None

    projectile = {
        "kind": "seeker", "owner": shooter.id, "target_id": target.id,
        "target_x": target.x, "target_y": target.y,
        "x": shooter.x, "y": shooter.y, "vx": 100.0, "vy": 0.0, "turn": 2.4,
    }
    arena._steer(room, projectile, .05)
    assert projectile["target_id"] is None


def test_dead_player_cannot_collect_pickup_use_ability_or_take_flag():
    now = time.monotonic()
    room = arena.Room(code="DEAD", map_id="tidal", mode="ctf")
    arena._make_flags(room)
    dead = make_player("dead", x=round((960 - 76) * arena.MAP_SCALE),
                       y=round(320 * arena.MAP_SCALE), dead_until=now + 5)
    room.players[dead.id] = dead
    room.pickups = [{"id": 1, "x": dead.x, "y": dead.y, "weapon": "lobber", "respawn_at": 0}]

    arena._collect_pickups(room, now)
    arena._use_ability(room, dead, "shield", now)
    arena._update_flags(room, now)

    assert "lobber" not in dead.owned_weapons
    assert room.pickups[0]["respawn_at"] == 0
    assert dead.shield_until == 0
    assert dead.carried_flag is None
    assert room.flags["1"]["carrier"] is None


def test_mode_scoring_and_winner_rules():
    now = time.monotonic()

    normal = arena.Room(code="NORMAL", map_id="tidal", mode="normal")
    source, target = make_player("source"), make_player("target", hp=1)
    normal.players = {source.id: source, target.id: target}
    arena._hurt(normal, source, target, 5, now)
    assert normal.winner is None
    assert source.score == 100
    assert target.dead_until > now

    zombie_dm = arena.Room(code="ZDM", map_id="tidal", mode="zombie_dm")
    source, infected = make_player("source", hp=100), make_player("infected", hp=1, zombie=True, bot=True)
    source.souls = 1199
    zombie_dm.players = {source.id: source, infected.id: infected}
    arena._hurt(zombie_dm, source, infected, 5, now)
    assert zombie_dm.winner == source.id

    team_dm = arena.Room(code="TDM", map_id="tidal", mode="team_dm")
    source = make_player("source", team=0)
    teammate = make_player("teammate", team=0, hp=1)
    enemy = make_player("enemy", team=1, hp=1)
    team_dm.players = {p.id: p for p in (source, teammate, enemy)}
    assert not arena._can_damage(team_dm, source, teammate)
    team_dm.team_scores["0"] = 1170
    arena._hurt(team_dm, source, enemy, 5, now)
    assert team_dm.team_scores["0"] == 1200
    assert team_dm.winner == "0"

    duel = arena.Room(code="DUEL", map_id="tidal", mode="duel")
    source, opponent = make_player("source"), make_player("opponent", hp=1)
    opponent.lives = 1
    duel.players = {source.id: source, opponent.id: opponent}
    arena._hurt(duel, source, opponent, 5, now)
    assert opponent.lives == 0
    assert duel.winner == source.id

    ctf = arena.Room(code="CTF", map_id="tidal", mode="ctf")
    arena._make_flags(ctf)
    runner = make_player("runner", x=round(76 * arena.MAP_SCALE),
                         y=round(320 * arena.MAP_SCALE), team=0, carried_flag=1)
    ctf.players[runner.id] = runner
    ctf.flags["1"]["carrier"] = runner.id
    ctf.team_scores["0"] = 2
    arena._update_flags(ctf, now)
    assert runner.captures == 1
    assert ctf.winner == "0"

    coop = arena.Room(code="COOP", map_id="tidal", mode="zombie_coop")
    infected, victim = make_player("infected", zombie=True, bot=True), make_player("victim", hp=1)
    coop.players = {infected.id: infected, victim.id: victim}
    original_random = arena.random.random
    arena.random.random = lambda: 0
    try:
        arena._hurt(coop, infected, victim, 5, now)
    finally:
        arena.random.random = original_random
    assert victim.is_zombie
    assert victim.dead_until == 0
    assert coop.winner == "zombies"


def test_duel_mode_never_injects_a_third_bot():
    room = arena.Room(code="DUEL", map_id="tidal", mode="duel")
    first = make_player("first")
    room.players[first.id] = first
    arena._populate_bots(room)
    asyncio.run(arena.broadcast(room, arena.room_view(room)))
    assert list(room.players) == [first.id]


def test_team_deathmatch_uses_two_human_teams_for_bots():
    room = arena.Room(code="TDM-BOTS", map_id="tidal", mode="team_dm")
    first = make_player("first", team=0)
    room.players[first.id] = first

    arena._populate_bots(room)

    bots = [player for player in room.players.values() if player.is_bot]
    assert len(bots) == 4
    assert all(not player.is_zombie for player in bots)
    assert {player.team for player in bots} == {0, 1}


@pytest.mark.parametrize("mode", arena.MODES)
def test_each_mode_starts_with_its_protocol_fields(mode):
    with TestClient(public_app) as client:
        with client.websocket_connect("/ws/arena") as socket:
            socket.send_json({"type": "join", "name": "ModeCheck",
                              "map": "tidal", "mode": mode})
            welcome = socket.receive_json()

    assert welcome["type"] == "welcome"
    assert welcome["mode"] == mode
    assert welcome["mode_name"] == arena.MODES[mode]["name"]
    assert welcome["capacity"] == arena.ROOM_CAPACITIES[mode]
    assert welcome["state_interval_ms"] == 50
    if mode == "ctf":
        assert set(welcome["flags"]) == {"0", "1"}
    if mode == "duel":
        assert any(player["lives"] == 5 for player in welcome["players"]
                   if not player["is_bot"])
        assert not any(player["is_bot"] for player in welcome["players"])
    if mode == "team_dm":
        bots = [player for player in welcome["players"] if player["is_bot"]]
        assert len(bots) == 4 and {player["team"] for player in bots} == {0, 1}
    if mode == "zombie_coop":
        assert sum(player["is_zombie"] for player in welcome["players"]) == 18


def test_pickup_and_reload_fill_magazine_from_reserve():
    now = time.monotonic()
    room = arena.Room(code="AMMO", map_id="tidal")
    player = make_player("player")
    room.players[player.id] = player
    room.pickups = [{"id": 1, "x": player.x, "y": player.y, "weapon": "lobber", "respawn_at": 0}]

    arena._collect_pickups(room, now)
    assert "lobber" in player.owned_weapons
    assert player.ammo["lobber"]["mag"] == 1
    assert player.ammo["lobber"]["reserve"] == 7

    player.weapon = "lobber"
    player.ammo["lobber"] = {"mag": 0, "reserve": 7, "reload_until": 0}
    player.aim_x, player.aim_y = 500, player.y
    player.firing = True
    arena._reload(player, now)
    arena._spawn_projectile(room, player, player.ammo["lobber"]["reload_until"] + .01)
    assert room.projectiles
    assert player.ammo["lobber"]["reserve"] == 6
