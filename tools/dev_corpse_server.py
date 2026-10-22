"""Dev-only harness: real death, very long respawn, so the corpse can be
inspected on a real kill instead of an injected fake.

    .venv/Scripts/python.exe tools/dev_corpse_server.py --port 4187
"""
import argparse
import math
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import arena  # noqa: E402
from backend.arena_public import app  # noqa: E402

arena.RESPAWN_DELAY = 120.0

_killed = set()


def _executor():
    while True:
        time.sleep(.4)
        now = time.monotonic()
        for room in list(arena.rooms.values()):
            players = list(room.players.values())
            humans = [p for p in players if not p.is_bot and not p.is_zombie]
            bots = [p for p in players if p.is_bot]
            for human in humans:
                if human.id in _killed or human.dead_until > now:
                    continue
                if human.invincible_until > now or human.jump_until > now:
                    continue
                _killed.add(human.id)
                if bots:
                    human.aim_x, human.aim_y = human.x + 100, human.y
                    arena._hurt(room, bots[0], human, 999, now)
                else:
                    human.aim_x, human.aim_y = human.x + 100, human.y
                    arena._fall_into_water(room, human, now)


threading.Thread(target=_executor, daemon=True).start()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4187)
    args = parser.parse_args()
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
