"""Exercise an 8-pilot session through HTTP(S)/WS(S); no real-player claims."""
import argparse
import asyncio
import json
import platform
import statistics
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

import websockets


def summary(values):
    ordered = sorted(values)
    return {"samples": len(ordered), "p50": round(statistics.median(ordered), 2) if ordered else None,
            "p95": round(ordered[min(len(ordered) - 1, int(len(ordered) * .95))], 2) if ordered else None,
            "max": round(max(ordered), 2) if ordered else None}


async def verify(base_url, players, duration):
    base = urlsplit(base_url)
    origin = f"{base.scheme}://{base.netloc}"
    ws_url = f"{'wss' if base.scheme == 'https' else 'ws'}://{base.netloc}/ws/arena"
    sockets, tasks, pilot_ids, stats, errors = [], [], [], [], []
    stop = asyncio.Event()
    room = ""
    started = 0

    async def observe(socket, pilot_id, stat):
        previous = None
        try:
            async for raw in socket:
                message = json.loads(raw)
                now = time.perf_counter()
                if message.get("type") == "state":
                    stat["states"] += 1
                    if previous is not None:
                        stat["intervals"].append((now - previous) * 1000)
                    previous = now
                    stat["rounds"].add(message.get("round_number"))
                    ids = {p["id"] for p in message.get("players", [])}
                    if started and now - started > 2 and not set(pilot_ids).issubset(ids):
                        errors.append(f"{pilot_id}: roster lost a connected pilot")
                        return
                elif message.get("type") == "pong":
                    stat["rtts"].append((now - message["sent"]) * 1000)
                elif message.get("type") == "error":
                    errors.append(f"{pilot_id}: {message.get('code', message.get('message'))}")
        except websockets.ConnectionClosed as exc:
            if not stop.is_set():
                errors.append(f"{pilot_id}: unexpected close {exc.code}")
        except Exception as exc:
            errors.append(f"{pilot_id}: {type(exc).__name__}: {exc}")

    async def inputs(socket, index):
        try:
            while not stop.is_set():
                phase = int(time.perf_counter() * .4 + index) % 4
                dx, dy = [(1, 0), (0, 1), (-1, 0), (0, -1)][phase]
                await socket.send(json.dumps({"type": "input", "x": dx, "y": dy,
                                               "aim_x": 1500, "aim_y": 1000, "fire": True}))
                await socket.send(json.dumps({"type": "ping", "sent": time.perf_counter()}))
                await asyncio.sleep(.05)
        except websockets.ConnectionClosed:
            if not stop.is_set():
                errors.append(f"pilot {index}: disconnected during input")

    try:
        for index in range(players):
            socket = await websockets.connect(ws_url, origin=origin, open_timeout=15)
            sockets.append(socket)
            await socket.send(json.dumps({"type": "join", "name": f"Playtest-{index + 1}",
                                          "room": room, "mode": "normal"}))
            while True:
                welcome = json.loads(await asyncio.wait_for(socket.recv(), timeout=15))
                if welcome.get("type") in {"welcome", "error"}:
                    break
            if welcome.get("type") != "welcome":
                raise RuntimeError(welcome)
            room = welcome["room"]
            pilot_ids.append(welcome["id"])
            stat = {"states": 0, "intervals": [], "rtts": [], "rounds": set()}
            stats.append(stat)
            tasks.append(asyncio.create_task(observe(socket, welcome["id"], stat)))
        started = time.perf_counter()
        tasks.extend(asyncio.create_task(inputs(socket, i)) for i, socket in enumerate(sockets))
        await asyncio.sleep(duration)
        for index, stat in enumerate(stats):
            if stat["states"] < max(5, duration * 5) or not stat["rtts"]:
                errors.append(f"pilot {index}: missing continuous state or pong samples")
        return {"scope": "synthetic WebSocket clients on this host; not real-player acceptance",
                "base_url": base_url, "room": room, "players": players, "duration_seconds": duration,
                "python": platform.python_version(), "platform": platform.platform(),
                "state_interval_ms": summary([v for s in stats for v in s["intervals"]]),
                "rtt_ms": summary([v for s in stats for v in s["rtts"]]),
                "states_per_pilot": [s["states"] for s in stats],
                "rounds_observed": sorted({r for s in stats for r in s["rounds"] if r is not None}),
                "errors": list(dict.fromkeys(errors)), "passed": not errors}
    finally:
        stop.set()
        for socket in sockets:
            try:
                await socket.send(json.dumps({"type": "leave"}))
                await socket.close()
            except websockets.ConnectionClosed:
                pass
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8082")
    parser.add_argument("--players", type=int, default=8)
    parser.add_argument("--duration", type=float, default=60)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 2 <= args.players <= 20 or args.duration < 3:
        parser.error("players must be 2-20 and duration must be at least 3 seconds")
    with urlopen(args.base_url.rstrip('/') + '/health', timeout=15) as response:
        assert response.status == 200
    report = asyncio.run(verify(args.base_url, args.players, args.duration))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == '__main__':
    main()
