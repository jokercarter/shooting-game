"""Dev-only helper server.

Wraps the public arena app and grants experience to the joined human pilots so
the progression HUD (level badge, XP bar, stat points) can be inspected in a
real browser session. This file is tooling, it is not part of the game.

    python -m tools.dev_progression_server --port 4181
"""
import argparse
import os
import sys
import threading
import time

import uvicorn

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import arena
from backend.arena_public import app as public_app


def _granter():
    """Hand out XP to every human pilot so the progression HUD fills up.

    Optionally kills a pilot after a few seconds so the corpse rendering and
    the respawn flow can be inspected in a real browser session.
    """
    print('[dev] granter started', flush=True)
    while True:
        time.sleep(1.0)
        now = time.monotonic()
        for room in list(arena.rooms.values()):
            for player in list(room.players.values()):
                if player.is_bot or player.is_zombie:
                    continue
                arena._grant_xp(room, player, arena._xp_to_next(player.level) * .45, now)
                print(f'[dev] {player.name} xp={player.xp:.0f} lv={player.level} '
                      f'sp={player.stat_points}', flush=True)
                if os.environ.get('ARENA_DEV_KILL') == '1' and player.dead_until <= now \
                        and player.invincible_until <= now and player.jump_until <= now \
                        and not getattr(player, '_dev_killed', False):
                    # A real death, so the client renders the corpse from the
                    # authoritative state instead of a synthetic patch. The
                    # killer is a bot so it never collects experience itself.
                    player._dev_killed = True
                    killer = next((p for p in room.players.values()
                                   if p.id != player.id and p.is_bot), None)
                    if killer is None:
                        killer = arena.Player(id='dev-killer', name='DevKiller', x=player.x,
                                              y=player.y, hue='#ff6b6b', hp=100, team=0,
                                              is_zombie=False, is_bot=True, invincible_until=0)
                        room.players[killer.id] = killer
                    killer.x, killer.y = player.x, player.y
                    arena._hurt(room, killer, player, 999, now)
                    print(f'[dev] killed {player.name}', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4181)
    args = parser.parse_args()

    threading.Thread(target=_granter, daemon=True).start()
    uvicorn.run(public_app, host='127.0.0.1', port=args.port, log_level='warning')


if __name__ == '__main__':
    main()
