"""Measure state cadence and WebSocket round-trip time with multiple players."""
import argparse
import asyncio
import json
import statistics
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

import websockets


def fetch_json(url):
    with urlopen(url, timeout=5) as response:
        return json.loads(response.read())


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * fraction))
    return round(ordered[index], 2)


async def observe(socket, duration, state_intervals, server_state_intervals,
                  rtts, server_delays, state_sizes, stop):
    previous_state = None
    previous_server_time = None
    try:
        while not stop.is_set():
            raw = await socket.recv()
            received_at = asyncio.get_running_loop().time()
            message = json.loads(raw)
            if message.get("type") == "state":
                state_sizes.append(len(raw))
                if previous_state is not None:
                    state_intervals.append((received_at - previous_state) * 1000)
                previous_state = received_at
                server_time = message.get("server_time")
                if isinstance(server_time, (int, float)):
                    if previous_server_time is not None:
                        server_state_intervals.append(max(0, (server_time - previous_server_time) * 1000))
                    previous_server_time = server_time
                    server_delays.append(max(0, (received_at - server_time) * 1000))
            elif message.get("type") == "pong":
                sent = message.get("sent")
                if isinstance(sent, (int, float)):
                    rtts.append(max(0, (received_at - sent) * 1000))
    except (websockets.ConnectionClosed, asyncio.CancelledError):
        return


async def send_inputs(socket, duration, stop, fire, interval_ms, phase_seconds=0.0):
    deadline = asyncio.get_running_loop().time() + duration
    try:
        if phase_seconds > 0:
            await asyncio.sleep(phase_seconds)
        while asyncio.get_running_loop().time() < deadline and not stop.is_set():
            await socket.send(json.dumps({
                "type": "input", "x": 1, "y": 0, "aim_x": 1500,
                "aim_y": 1000, "fire": fire, "aiming": False,
                "alt_fire": False,
            }))
            await asyncio.sleep(interval_ms / 1000)
    except (websockets.ConnectionClosed, asyncio.CancelledError):
        return


async def drain_pending(socket):
    """Discard join-time snapshots so the report covers steady-state play."""
    for _ in range(120):
        try:
            await asyncio.wait_for(socket.recv(), timeout=.01)
        except asyncio.TimeoutError:
            return
        except websockets.ConnectionClosed:
            return


async def measure(base_url, players, duration, fire, input_interval_ms):
    base = urlsplit(base_url)
    scheme = "wss" if base.scheme == "https" else "ws"
    host = base.netloc
    websocket_url = f"{scheme}://{host}/ws/arena"
    origin = f"{base.scheme}://{host}"
    sockets = []
    observers = []
    senders = []
    state_intervals = []
    server_state_intervals = []
    rtts = []
    server_delays = []
    state_sizes = []
    stop = asyncio.Event()
    room_code = ""
    welcome = None
    try:
        for index in range(players):
            socket = await websockets.connect(websocket_url, origin=origin)
            sockets.append(socket)
            await socket.send(json.dumps({
                "type": "join", "name": f"Latency-{index + 1}",
                "room": room_code, "map": "tidal", "mode": "normal",
            }))
            while True:
                welcome = json.loads(await socket.recv())
                if welcome.get("type") in {"welcome", "error"}:
                    break
            if welcome.get("type") != "welcome":
                raise RuntimeError(welcome)
            room_code = room_code or welcome["room"]
            await asyncio.sleep(.03)

        await asyncio.gather(*(drain_pending(socket) for socket in sockets))
        for index, socket in enumerate(sockets):
            observers.append(asyncio.create_task(
                observe(socket, duration, state_intervals, server_state_intervals,
                        rtts, server_delays, state_sizes, stop)))
            phase = .025 * index / max(1, len(sockets) - 1)
            senders.append(asyncio.create_task(
                send_inputs(socket, duration, stop, fire, input_interval_ms, phase)))

        async def ping_loop():
            deadline = asyncio.get_running_loop().time() + duration
            while asyncio.get_running_loop().time() < deadline and not stop.is_set():
                sent = asyncio.get_running_loop().time()
                await sockets[0].send(json.dumps({"type": "ping", "sent": sent}))
                await asyncio.sleep(.25)

        pinger = asyncio.create_task(ping_loop())
        await asyncio.sleep(duration + .1)
        stop.set()
        await asyncio.gather(*senders, pinger, return_exceptions=True)
        await asyncio.gather(*(socket.close() for socket in sockets), return_exceptions=True)
        await asyncio.gather(*observers, return_exceptions=True)
        humans = sum(not player["is_bot"] for player in welcome["players"])
        intervals_over_20ms = sum(interval > 20 for interval in state_intervals)
        intervals_over_25ms = sum(interval > 25 for interval in state_intervals)
        server_intervals_over_20ms = sum(interval > 20 for interval in server_state_intervals)
        return {
            "base_url": base_url,
            "room": room_code,
            "humans": humans,
            "connections": players,
            "duration_seconds": duration,
            "fire": fire,
            "input_interval_ms": input_interval_ms,
            "state_interval_ms": welcome.get("state_interval_ms"),
            "state_samples": len(state_intervals),
            "state_interval_median_ms": percentile(state_intervals, .50),
            "state_interval_p95_ms": percentile(state_intervals, .95),
            "state_interval_max_ms": round(max(state_intervals), 2) if state_intervals else None,
            "state_intervals_over_20ms": intervals_over_20ms,
            "state_interval_over_20ms_pct": round(100 * intervals_over_20ms / len(state_intervals), 2) if state_intervals else None,
            "state_intervals_over_25ms": intervals_over_25ms,
            "state_interval_over_25ms_pct": round(100 * intervals_over_25ms / len(state_intervals), 2) if state_intervals else None,
            "server_state_samples": len(server_state_intervals),
            "server_state_interval_median_ms": percentile(server_state_intervals, .50),
            "server_state_interval_p95_ms": percentile(server_state_intervals, .95),
            "server_state_interval_max_ms": round(max(server_state_intervals), 2) if server_state_intervals else None,
            "server_state_intervals_over_20ms": server_intervals_over_20ms,
            "state_bytes_avg": round(statistics.mean(state_sizes)) if state_sizes else None,
            "state_bytes_p95": percentile(state_sizes, .95),
            "server_delay_median_ms": percentile(server_delays, .50),
            "server_delay_p95_ms": percentile(server_delays, .95),
            "pong_samples": len(rtts),
            "pong_rtt_median_ms": percentile(rtts, .50),
            "pong_rtt_p95_ms": percentile(rtts, .95),
            "pong_rtt_max_ms": round(max(rtts), 2) if rtts else None,
        }
    finally:
        stop.set()
        for task in (*senders, *observers):
            task.cancel()
        if senders or observers:
            await asyncio.gather(*senders, *observers, return_exceptions=True)
        if sockets:
            await asyncio.gather(*(socket.close() for socket in sockets), return_exceptions=True)
        if room_code:
            for _ in range(30):
                if all(card["code"] != room_code for card in fetch_json(
                        f"{base_url.rstrip('/')}/api/arena/rooms")):
                    break
                await asyncio.sleep(.1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8082")
    parser.add_argument("--players", type=int, default=10)
    parser.add_argument("--duration", type=float, default=5)
    parser.add_argument("--input-interval-ms", type=float, default=17,
                        help="input cadence per client, matching high-player browser input")
    parser.add_argument("--no-fire", action="store_true",
                        help="send movement only to isolate state serialization cost")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.players < 2 or args.players > 20:
        parser.error("--players must be between 2 and 20")
    if args.input_interval_ms <= 0:
        parser.error("--input-interval-ms must be positive")
    report = asyncio.run(measure(args.base_url, args.players, args.duration,
                                 not args.no_fire, args.input_interval_ms))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
