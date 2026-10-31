"""Standalone public entry point for Morrow Fields."""
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .arena import router as arena_router
from .arena_timing import (current_timer_resolution_ms,
                           disable_high_resolution_timer,
                           enable_high_resolution_timer)

ROOT = Path(__file__).resolve().parents[1]

@asynccontextmanager
async def lifespan(_app):
    timer_enabled = enable_high_resolution_timer()
    if os.environ.get('ARENA_PROFILE_TICKS') == '1':
        logging.getLogger(__name__).warning(
            'arena_timer_resolution enabled=%s current_ms=%s',
            timer_enabled, current_timer_resolution_ms())
    try:
        yield
    finally:
        disable_high_resolution_timer()

app = FastAPI(title='Morrow Fields', lifespan=lifespan)
app.include_router(arena_router)

@app.get('/')
def home(request: Request):
    # Keep the query string: hosted proxies hand out a share code there and the
    # client forwards it when it upgrades the WebSocket.
    query = request.url.query
    return RedirectResponse('/arena/' + (f'?{query}' if query else ''))

@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'morrow-fields'}

# Local runs serve the built bundle from dist/; hosts that upload the source
# tree without build output still work because public/arena is the same files.
STATIC_DIR = ROOT / 'dist' / 'arena'
if not STATIC_DIR.exists():
    STATIC_DIR = ROOT / 'public' / 'arena'

app.mount('/arena', StaticFiles(directory=STATIC_DIR, html=True), name='arena')
