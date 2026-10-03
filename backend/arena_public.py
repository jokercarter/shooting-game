"""Standalone public entry point for Morrow Fields."""
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path

from fastapi import FastAPI
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
def home():
    return RedirectResponse('/arena/')

@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'morrow-fields'}

app.mount('/arena', StaticFiles(directory=ROOT / 'dist' / 'arena', html=True), name='arena')
