FROM python:3.13-slim

WORKDIR /app

# Spaces mounts no writable home for the app user, so keep the SQLite profile
# store on /tmp. The store fails open anyway: a read-only disk only costs us
# career stats, never the arena itself.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ARENA_DB=/tmp/arena.sqlite3

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY public/arena ./dist/arena

EXPOSE 8080

# Spaces routes app_port (8080, see README.md front matter) to the public URL.
CMD ["uvicorn", "backend.arena_public:app", "--host", "0.0.0.0", "--port", "8080"]
