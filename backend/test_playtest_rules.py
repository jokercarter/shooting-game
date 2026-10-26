"""Friend-playtest contracts: fair rounds, durable records and private feedback."""
import asyncio
import json
import time

import pytest
from fastapi.testclient import TestClient

from backend import arena, store
from backend.arena_public import app


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "arena.sqlite3")
    monkeypatch.setattr(store, "_ready", False)
    monkeypatch.setattr(store, "_disabled", False)
    yield
    arena.reconnect_sessions.clear()


def pilot(name, **kwargs):
    x, y = arena.safe_spawn("tidal", [])
    return arena.Player(id=name, name=name, x=x, y=y, hue="#fff",
                        invincible_until=0, **kwargs)


def test_round_reset_clears_growth_and_corpse_but_keeps_personal_best():
    now = time.monotonic()
    pid = "personal-best"
    store.touch(pid, "Pilot")
    store.save_progress(pid, 12, 3000)
    player = pilot("pilot", profile_id=pid, level=7, xp=1000, stat_points=2,
                   hp=0, dead_until=now + 5, death_at=now, corpse_angle=2)
    player.upgrades["vitality"] = 3
    player.upgrades["rapid"] = 2
    player.death_feedback = {"killer": "old"}
    player.shield_until = player.jump_until = now + 5
    room = arena.Room(code="RESET", map_id="tidal", players={player.id: player}, winner=player.id)
    arena._reset_round(room, "glass", now)
    assert (player.level, player.xp, player.stat_points) == (1, 0, 0)
    assert set(player.upgrades.values()) == {0}
    assert player.hp == 100 and player.death_at == player.dead_until == 0
    assert player.death_feedback is None and player.shield_until == player.jump_until == 0
    assert player.owned_weapons == {"pulse"}
    assert room.round_number == 2 and room.map_id == "glass"
    assert store.load(pid)["level"] == 12 and store.load(pid)["matches"] == 1


def test_dying_and_respawning_preserve_current_round_build():
    now = time.monotonic()
    source, target = pilot("source"), pilot("target", hp=1, level=5, xp=500, stat_points=3)
    target.upgrades["vitality"] = 2
    room = arena.Room(code="DEATH", map_id="tidal", players={p.id: p for p in (source, target)})
    arena._hurt(room, source, target, 50, now, weapon="flare")
    assert target.dead_until > now
    arena._respawn_player(room, target, now + arena.RESPAWN_DELAY)
    assert (target.level, target.xp, target.stat_points, target.upgrades["vitality"]) == (5, 500, 3, 2)
    assert target.hp == 140 and target.death_feedback is None


def test_personal_best_survives_lower_rounds_and_database_reopen():
    pid = "career-player"
    store.touch(pid, "Pilot")
    store.save_progress(pid, 12, 3000)
    store.save_progress(pid, 3, 160)
    store.record_match(pid, "normal", "tidal", 2, 1, 200, 3)
    store._ready = False  # simulate a service restart without replacing the file
    assert (store.load(pid)["level"], store.load(pid)["xp"]) == (12, 3000)
    store.save_progress(pid, 12, 3100)
    assert store.load(pid)["xp"] == 3100


def test_finish_is_recorded_once_before_voting_and_never_counts_unfinished_round():
    pid = "match-player"
    store.touch(pid, "Pilot")
    player = pilot("pilot", profile_id=pid, kills=4, deaths=2, score=400, level=6, xp=700)
    room = arena.Room(code="RECORD", map_id="tidal", players={player.id: player})
    arena._record_match(room)
    assert store.load(pid)["matches"] == 0
    room.winner = player.id
    arena._check_round_end(room, time.monotonic())
    arena._record_match(room)
    assert store.load(pid)["matches"] == 1
    arena._reset_round(room, "tidal", time.monotonic())
    assert store.load(pid)["matches"] == 1
    assert store.load(pid)["recent"][0]["kills"] == 4
    room.winner = player.id
    arena._check_round_end(room, time.monotonic())
    assert store.load(pid)["matches"] == 2


@pytest.mark.parametrize("tied", [False, True])
def test_ffa_timer_finishes_and_opens_vote(tied):
    now = time.monotonic()
    a, b = pilot("a", score=100), pilot("b", score=100 if tied else 0)
    room = arena.Room(code="TIMER", map_id="tidal", players={p.id: p for p in (a, b)},
                      started_at=now - arena.FFA_ROUND_SECONDS)
    arena._check_round_end(room, now)
    assert room.winner == ("draw" if tied else "a")
    assert room.map_vote_deadline == now + 15
    assert arena.room_view(room, a.id)["round_remaining"] == 0


def test_hit_direction_and_killing_weapon_are_private_and_do_not_contain_positions():
    now = time.monotonic()
    source, target = pilot("source"), pilot("victim", hp=1)
    source.x, source.y = target.x + 200, target.y
    source.weapon = "pulse"  # shooter switched after launching a rocket
    room = arena.Room(code="FEEDBACK", map_id="tidal", players={p.id: p for p in (source, target)})
    arena._hurt(room, source, target, 30, now, weapon="flare")
    own = arena.player_view(target, room.map_id, target.id, now, target)
    assert own["death_feedback"]["weapon"] == "flare"
    assert own["death_feedback"]["killer"] == "source"
    assert own["hit_feedback"]["direction"] == "right"
    assert set(own["hit_feedback"]) == {"id", "direction", "age"}
    assert set(own["death_feedback"]) == {"id", "cause", "killer", "weapon"}
    for viewer in (None, source.id):
        view = arena.player_view(target, room.map_id, viewer, now, source if viewer else None)
        assert view["death_feedback"] is None and view["hit_feedback"] is None


def test_feedback_is_private_in_shared_broadcast_and_spectator_stream():
    class Sink:
        def __init__(self): self.messages = []
        async def send_text(self, value): self.messages.append(json.loads(value))
        async def send_json(self, value): self.messages.append(value)

    now = time.monotonic()
    players = [pilot(str(i)) for i in range(8)]
    room = arena.Room(code="SHARED", map_id="tidal", players={p.id: p for p in players})
    room.sockets = {p.id: Sink() for p in players}
    room.spectator_sockets = {"observer": Sink()}
    arena._hurt(room, players[0], players[1], 500, now, weapon="lobber")
    asyncio.run(arena.broadcast(room))
    assert room.sockets["1"].messages[-1]["player"]["death_feedback"]["weapon"] == "lobber"
    for pid in ("0", "2"):
        for message in room.sockets[pid].messages:
            victim = next(p for p in message.get("players", []) if p["id"] == "1")
            assert not victim.get("death_feedback") and not victim.get("hit_feedback")
    assert "resume_token" not in json.dumps(room.spectator_sockets["observer"].messages)
    assert "death_feedback\": {" not in json.dumps(room.spectator_sockets["observer"].messages)


def test_blast_direction_follows_the_impact_even_if_the_shooter_has_moved():
    now = time.monotonic()
    source, target = pilot("source"), pilot("victim")
    source.x, source.y = target.x + 200, target.y
    room = arena.Room(code="BLAST-DIRECTION", map_id="tidal", players={p.id: p for p in (source, target)})
    arena._blast(room, {"owner": source.id, "weapon": "flare", "x": target.x - 8,
                        "y": target.y, "damage": 20, "blast": 40}, now)
    assert target.hit_feedback["direction"] == "left"


def test_water_death_is_saved_and_has_an_environmental_receipt():
    now = time.monotonic()
    pid = "river-player"
    store.touch(pid, "River")
    target = pilot("target", profile_id=pid)
    room = arena.Room(code="RIVER", map_id="tidal", players={target.id: target})
    arena._fall_into_water(room, target, now)
    arena._fall_into_water(room, target, now + .1)
    assert store.load(pid)["deaths"] == 1
    assert target.death_feedback["cause"] == "river"


def welcome(socket):
    for _ in range(100):
        message = socket.receive_json()
        if message["type"] in {"welcome", "error"}:
            return message
    raise AssertionError("no welcome")


def test_transient_reconnect_restores_pilot_without_restoring_career_combat_stats():
    store.touch("browser-player", "Pilot")
    store.save_progress("browser-player", 20, 9000)
    with TestClient(app) as client:
        with client.websocket_connect("/ws/arena") as first:
            first.send_json({"type": "join", "client_id": "browser-player"})
            initial = welcome(first)
            room = arena.rooms[initial["room"]]
            player = room.players[initial["id"]]
            assert player.level == 1
            player.level, player.xp, player.stat_points = 4, 300, 2
            player.upgrades["rapid"] = 2
        with client.websocket_connect("/ws/arena") as resumed:
            resumed.send_json({"type": "join", "room": initial["room"], "resume_token": initial["resume_token"]})
            result = welcome(resumed)
            assert result["id"] == initial["id"]
            local = next(p for p in result["players"] if p["id"] == result["id"])
            assert (local["level"], local["xp"], local["stat_points"]) == (4, 300, 2)
            assert local["upgrades"]["rapid"] == 2
            resumed.send_json({"type": "leave"})


@pytest.mark.parametrize("code,expected", [("NOPENO", "room_missing"), ("bad!", "room_invalid")])
def test_invalid_or_expired_invites_do_not_silently_create_a_room(code, expected):
    with TestClient(app) as client:
        with client.websocket_connect("/ws/arena") as socket:
            socket.send_json({"type": "join", "room": code})
            assert welcome(socket)["code"] == expected
        assert code not in arena.rooms


def test_ended_and_full_rooms_return_actionable_error_codes():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/arena") as first:
            first.send_json({"type": "join", "mode": "duel"})
            host = welcome(first)
            with client.websocket_connect("/ws/arena") as second:
                second.send_json({"type": "join", "room": host["room"]})
                assert welcome(second)["type"] == "welcome"
                with client.websocket_connect("/ws/arena") as third:
                    third.send_json({"type": "join", "room": host["room"]})
                    assert welcome(third)["code"] == "room_full"
            arena.rooms[host["room"]].winner = host["id"]
            with client.websocket_connect("/ws/arena") as late:
                late.send_json({"type": "join", "room": host["room"]})
                assert welcome(late)["code"] == "match_ended"


def test_two_completed_rounds_settle_once_and_broadcast_fresh_builds():
    def until(socket, predicate):
        for _ in range(300):
            message = socket.receive_json()
            if predicate(message):
                return message
        raise AssertionError("expected round state was not received")

    with TestClient(app) as client:
        with client.websocket_connect("/ws/arena") as first, client.websocket_connect("/ws/arena") as second:
            first.send_json({"type": "join", "client_id": "first-browser"})
            host = welcome(first)
            second.send_json({"type": "join", "room": host["room"], "client_id": "second-browser"})
            friend = welcome(second)
            room = arena.rooms[host["room"]]
            for round_number in (1, 2):
                for player in room.players.values():
                    if not player.is_bot:
                        player.level, player.xp, player.stat_points = 7, 1000, 3
                        player.upgrades["vitality"] = 3
                room.started_at = time.monotonic() - arena.FFA_ROUND_SECONDS - 1
                finished = until(first, lambda m: m.get("type") == "state" and m.get("winner") and m.get("round_number") == round_number)
                assert finished["round_remaining"] == 0
                assert client.get('/api/arena/profile/first-browser').json()["matches"] == round_number
                first.send_json({"type": "vote_map", "map": "glass"})
                second.send_json({"type": "vote_map", "map": "glass"})
                fresh = until(first, lambda m: m.get("type") == "state" and m.get("round_number") == round_number + 1)
                local = next(p for p in fresh["players"] if p["id"] == host["id"])
                assert fresh["map"] == "glass" and fresh["winner"] is None
                assert (local["level"], local["xp"], local["stat_points"], local["max_hp"]) == (1, 0, 0, 100)
                assert set(local["upgrades"].values()) == {0}
            assert store.load('first-browser')["matches"] == 2
            assert store.load('second-browser')["matches"] == 2
            assert store.load('first-browser')["level"] == 7
            first.send_json({"type": "leave"})
            second.send_json({"type": "leave"})


def test_expired_reconnect_ticket_cannot_recreate_a_closed_room():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/arena") as first:
            first.send_json({"type": "join"})
            initial = welcome(first)
        saved_room, player, _ = arena.reconnect_sessions[initial["resume_token"]]
        arena.reconnect_sessions[initial["resume_token"]] = (saved_room, player, time.monotonic() - 1)
        with client.websocket_connect("/ws/arena") as late:
            late.send_json({"type": "join", "room": initial["room"], "resume_token": initial["resume_token"]})
            assert welcome(late)["code"] == "room_missing"
