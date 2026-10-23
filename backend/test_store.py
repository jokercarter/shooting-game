"""Persistence tests: the profile store must survive restarts and fail open."""
import pytest

from backend import store


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "arena.sqlite3")
    monkeypatch.setattr(store, "_ready", False)
    monkeypatch.setattr(store, "_disabled", False)
    yield
    monkeypatch.setattr(store, "_ready", False)
    monkeypatch.setattr(store, "_disabled", False)


def test_client_ids_are_normalised():
    assert store.profile_id("abc") == ""
    assert store.profile_id(None) == ""
    assert store.profile_id("p-12345678") == "p-12345678"
    assert store.profile_id("p 1234/5678") == "p12345678"


def test_profile_is_created_then_accumulates_career_stats(fresh_db):
    pid = "client-abcdefgh"
    created = store.touch(pid, "Carter")
    assert created["nickname"] == "Carter"
    assert created["level"] == 1 and created["kills"] == 0

    store.bump(pid, "kills", 3)
    store.bump(pid, "deaths")
    store.save_progress(pid, 7, 940)

    again = store.load(pid)
    assert again["kills"] == 3
    assert again["deaths"] == 1
    assert (again["level"], again["xp"]) == (7, 940)


def test_matches_feed_the_daily_board(fresh_db):
    pid = "client-abcdefgh"
    store.touch(pid, "Carter")
    store.record_match(pid, "normal", "tidal", 9, 2, 900, 6)
    store.record_match(pid, "ctf", "glass", 4, 4, 400, 5)

    profile = store.load(pid)
    assert profile["matches"] == 2
    assert len(profile["recent"]) == 2

    board = store.leaderboard(limit=5)
    assert board and board[0]["id"] == pid
    assert board[0]["score"] == 900


def test_store_fails_open_when_the_database_is_unusable(tmp_path, monkeypatch):
    blocker = tmp_path / "not-a-dir"
    blocker.write_text("x", encoding="utf-8")
    monkeypatch.setattr(store, "DB_PATH", blocker / "arena.sqlite3")
    monkeypatch.setattr(store, "_ready", False)
    monkeypatch.setattr(store, "_disabled", False)

    assert store.touch("client-abcdefgh", "Carter") is None
    assert store.load("client-abcdefgh") is None
    assert store.leaderboard() == []
    # Writes must stay silent instead of raising into the game loop.
    store.bump("client-abcdefgh", "kills")
    store.record_match("client-abcdefgh", "normal", "tidal", 1, 1, 10, 1)
