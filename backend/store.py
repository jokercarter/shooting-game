"""Tiny SQLite profile store for Morrow Fields.

Accounts here are deliberately lightweight: a browser keeps a random client id
in localStorage and that id *is* the account. The only things worth persisting
are the numbers a player would be annoyed to lose -- level, xp, kills, deaths,
matches -- plus a short match history for the daily leaderboard.

The store fails open: if the database cannot be opened (read-only disk, tests,
CI), every call degrades to a no-op so the game keeps running.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "arena.sqlite3"
DB_PATH = Path(os.environ.get("ARENA_DB", DEFAULT_PATH))

_lock = threading.Lock()
_ready = False
_disabled = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id          TEXT PRIMARY KEY,
    nickname    TEXT NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    xp          INTEGER NOT NULL DEFAULT 0,
    kills       INTEGER NOT NULL DEFAULT 0,
    deaths      INTEGER NOT NULL DEFAULT 0,
    matches     INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    updated_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    mode      TEXT NOT NULL,
    map       TEXT NOT NULL,
    kills     INTEGER NOT NULL,
    deaths    INTEGER NOT NULL,
    score     INTEGER NOT NULL,
    level     INTEGER NOT NULL,
    ended_at  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_ended  ON matches(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_player ON matches(player_id, ended_at DESC);
"""


def _connect() -> sqlite3.Connection | None:
    global _ready, _disabled
    if _disabled:
        return None
    try:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=3)
        conn.row_factory = sqlite3.Row
        if not _ready:
            with _lock:
                conn.executescript(SCHEMA)
                conn.commit()
                _ready = True
        return conn
    except (sqlite3.Error, OSError):
        # A missing or read-only database must never take the arena down.
        _disabled = True
        return None


def profile_id(raw) -> str:
    """Normalise a client supplied id; anything unusable becomes empty."""
    if not isinstance(raw, str):
        return ""
    cleaned = "".join(ch for ch in raw if ch.isalnum() or ch in "-_")[:64]
    return cleaned if len(cleaned) >= 8 else ""


def touch(pid: str, nickname: str) -> dict | None:
    """Create the profile on first sight, otherwise refresh the nickname."""
    if not pid:
        return None
    conn = _connect()
    if conn is None:
        return None
    now = time.time()
    try:
        with _lock, conn:
            conn.execute(
                "INSERT INTO profiles(id, nickname, updated_at) VALUES(?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname, updated_at=excluded.updated_at",
                (pid, nickname or "Pilot", now),
            )
        return load(pid)
    finally:
        conn.close()


def load(pid: str) -> dict | None:
    if not pid:
        return None
    conn = _connect()
    if conn is None:
        return None
    try:
        with _lock:
            row = conn.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
            if row is None:
                return None
            recent = conn.execute(
                "SELECT kills, deaths, score, level, mode, ended_at FROM matches "
                "WHERE player_id=? ORDER BY ended_at DESC LIMIT 5",
                (pid,),
            ).fetchall()
        return {
            "id": row["id"], "nickname": row["nickname"], "level": row["level"],
            "xp": row["xp"], "kills": row["kills"], "deaths": row["deaths"],
            "matches": row["matches"], "best_streak": row["best_streak"],
            "recent": [dict(item) for item in recent],
        }
    finally:
        conn.close()


def bump(pid: str, column: str, amount: int = 1) -> None:
    """Add to one career counter; unknown columns are ignored."""
    if not pid or column not in {"kills", "deaths", "matches"}:
        return
    conn = _connect()
    if conn is None:
        return
    try:
        with _lock, conn:
            conn.execute(
                f"UPDATE profiles SET {column}={column}+?, updated_at=? WHERE id=?",
                (amount, time.time(), pid),
            )
    except sqlite3.Error:
        pass
    finally:
        conn.close()


def save_progress(pid: str, level: int, xp: int) -> None:
    if not pid:
        return
    conn = _connect()
    if conn is None:
        return
    try:
        with _lock, conn:
            conn.execute(
                "UPDATE profiles SET level=?, xp=?, updated_at=? WHERE id=?",
                (level, xp, time.time(), pid),
            )
    except sqlite3.Error:
        pass
    finally:
        conn.close()


def record_match(pid: str, mode: str, map_id: str, kills: int, deaths: int,
                 score: int, level: int) -> None:
    if not pid:
        return
    conn = _connect()
    if conn is None:
        return
    try:
        with _lock, conn:
            conn.execute(
                "INSERT INTO matches(player_id, mode, map, kills, deaths, score, level, ended_at)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (pid, mode, map_id, kills, deaths, score, level, time.time()),
            )
            conn.execute(
                "UPDATE profiles SET matches=matches+1, updated_at=? WHERE id=?",
                (time.time(), pid),
            )
    except sqlite3.Error:
        pass
    finally:
        conn.close()


def leaderboard(limit: int = 10, since_hours: float = 24.0) -> list[dict]:
    """Best single-match scores inside a rolling window."""
    conn = _connect()
    if conn is None:
        return []
    cutoff = time.time() - since_hours * 3600
    try:
        with _lock:
            rows = conn.execute(
                "SELECT m.player_id, p.nickname, MAX(m.score) AS score, MAX(m.kills) AS kills,"
                " COUNT(*) AS games FROM matches m LEFT JOIN profiles p ON p.id=m.player_id"
                " WHERE m.ended_at>=? GROUP BY m.player_id ORDER BY score DESC LIMIT ?",
                (cutoff, max(1, min(50, limit))),
            ).fetchall()
        return [{"id": r["player_id"], "nickname": r["nickname"] or "Pilot",
                 "score": r["score"], "kills": r["kills"], "games": r["games"]} for r in rows]
    finally:
        conn.close()


def reset_for_tests() -> None:
    """Drop every row; only used by the test-suite."""
    conn = _connect()
    if conn is None:
        return
    try:
        with _lock, conn:
            conn.execute("DELETE FROM profiles")
            conn.execute("DELETE FROM matches")
    finally:
        conn.close()
