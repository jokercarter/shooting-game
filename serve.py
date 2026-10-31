"""Portable entry point for hosted deploys.

Reads PORT from the environment instead of relying on shell expansion, so the
same command works for the local scripts, Docker, and hosting sandboxes.
"""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "backend.arena_public:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8080")),
    )
