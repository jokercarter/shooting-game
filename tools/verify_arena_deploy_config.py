"""Check the standalone Morrow Fields deployment files."""

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.arena_public import app


DOCKERFILE = ROOT / "Dockerfile.arena"
RENDER = ROOT / "render.yaml"


def main():
    docker = DOCKERFILE.read_text(encoding="utf-8")
    render = RENDER.read_text(encoding="utf-8")
    result = {
        "dockerfile_exists": DOCKERFILE.exists(),
        "render_config_exists": RENDER.exists(),
        "quick_tunnel_launcher_exists": (ROOT / "start-arena-public.ps1").exists(),
        "quick_tunnel_stop_exists": (ROOT / "stop-arena-public.ps1").exists(),
        "arena_backend_present": (ROOT / "backend" / "arena_public.py").exists(),
        "arena_static_present": (ROOT / "public" / "arena" / "index.html").exists(),
        "arena_build_present": (ROOT / "build.mjs").exists(),
        "static_copy_is_game_only": "COPY public/arena ./dist/arena" in docker,
        "public_backend_only": "backend.arena_public:app" in docker and
        "app.mount('/arena'" in (ROOT / "backend" / "arena_public.py").read_text(encoding="utf-8"),
        "port_uses_platform_value": "${PORT:-8080}" in docker,
        "docker_healthcheck": "HEALTHCHECK" in docker and "/health" in docker,
        "exec_entrypoint": "exec uvicorn backend.arena_public:app" in docker,
        "render_docker_runtime": "runtime: docker" in render,
        "render_health_path": "healthCheckPath: /health" in render,
    }
    with TestClient(app) as client:
        response = client.get("/health")
        result["health_status"] = response.status_code
        result["health_payload"] = response.json()
    result["preflight_passed"] = all(
        value is True for key, value in result.items()
        if key.endswith(("exists", "present", "only", "stage", "value", "runtime", "path"))
    ) and result["health_status"] == 200
    output = ROOT / "output" / "arena-validation" / "deployment-preflight.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["preflight_passed"] else 1)


if __name__ == "__main__":
    main()
