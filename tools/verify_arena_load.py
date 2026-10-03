"""Exercise room capacity against a running Morrow Fields server."""
import argparse
import asyncio
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

import websockets

ROOM_CASES = {
    "normal": (20, 4),
    "zombie_dm": (24, 4),
    "zombie_coop": (24, 18),
}


async def receive_type(socket, expected, timeout=5):
    async def receive():
        while True:
            message = json.loads(await socket.recv())
            if message.get("type") in expected:
                return message

    return await asyncio.wait_for(receive(), timeout)


async def drain_states(socket):
    try:
        async for _ in socket:
            pass
    except websockets.ConnectionClosed as exc:
        return exc.code
    return 1000


def fetch_json(url):
    with urlopen(url, timeout=5) as response:
        return json.loads(response.read())


async def verify_room(base_url, mode, capacity, expected_bots):
    base = urlsplit(base_url)
    scheme = "wss" if base.scheme == "https" else "ws"
    host = base.netloc
    websocket_url = f"{scheme}://{host}/ws/arena"
    origin = f"{base.scheme}://{host}"
    sockets, drainers = [], []
    room_code = ""
    report = None

    try:
        welcome = None
        reported_humans = []
        for index in range(capacity):
            socket = await websockets.connect(websocket_url, origin=origin)
            sockets.append(socket)
            await socket.send(json.dumps({
                "type": "join", "name": f"Load-{mode[:3]}-{index + 1}",
                "room": room_code, "map": "tidal", "mode": mode,
            }))
            welcome = await receive_type(socket, {"welcome", "error"})
            assert welcome["type"] == "welcome", welcome
            room_code = room_code or welcome["room"]
            reported_humans.append(sum(not player["is_bot"] for player in welcome["players"]))
            drainers.append(asyncio.create_task(drain_states(socket)))
            await asyncio.sleep(.05)

        await asyncio.sleep(.25)
        humans = sum(not player["is_bot"] for player in welcome["players"])
        bots = sum(player["is_bot"] for player in welcome["players"])
        state_interval_ms = welcome.get("state_interval_ms")
        closed_clients = sum(task.done() for task in drainers)
        room = next(card for card in fetch_json(f"{base_url.rstrip('/')}/api/arena/rooms")
                    if card["code"] == room_code)
        assert (humans == capacity and bots == expected_bots and state_interval_ms == 100 and
                not closed_clients and
                room["players"] == room["capacity"] == capacity), {
            "welcome_humans": humans, "api_humans": room["players"], "bots": bots,
            "state_interval_ms": state_interval_ms,
            "reported_humans": reported_humans, "closed_clients": closed_clients,
            "room": room,
        }

        overflow = await websockets.connect(websocket_url, origin=origin)
        try:
            await overflow.send(json.dumps({"type": "join", "name": "Overflow",
                                            "room": room_code, "mode": mode}))
            error = await receive_type(overflow, {"error"})
            assert "full" in error["message"].lower(), error
        finally:
            await overflow.close()

        report = {"mode": mode, "room": room_code, "humans": humans, "bots": bots,
                  "reported_humans": reported_humans, "closed_clients": closed_clients,
                  "state_interval_ms": state_interval_ms,
                  "capacity": room["capacity"], "overflow_rejected": True}
        return report
    finally:
        if sockets:
            await asyncio.gather(*(socket.close() for socket in sockets), return_exceptions=True)
        for task in drainers:
            task.cancel()
        if drainers:
            await asyncio.gather(*drainers, return_exceptions=True)
        rooms_url = f"{base_url.rstrip('/')}/api/arena/rooms"
        for _ in range(20):
            if all(card["code"] != room_code for card in fetch_json(rooms_url)):
                break
            await asyncio.sleep(.1)
        remaining = fetch_json(rooms_url)
        assert all(card["code"] != room_code for card in remaining), remaining
        if report is not None:
            report["room_cleaned"] = True


async def verify(base_url, modes):
    results = []
    for mode in modes:
        capacity, bots = ROOM_CASES[mode]
        results.append(await verify_room(base_url, mode, capacity, bots))
    return {"modes": results, "all_rooms_cleaned": all(item["room_cleaned"] for item in results)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:4175")
    parser.add_argument("--mode", choices=ROOM_CASES, action="append",
                        help="room mode to probe; defaults to normal and zombie_coop")
    parser.add_argument("--output", type=Path, help="write the JSON report to this path")
    args = parser.parse_args()
    modes = args.mode or ["normal", "zombie_coop"]
    report = json.dumps(asyncio.run(verify(args.base_url, modes)), ensure_ascii=False, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report + "\n", encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
