"""Remove only known Arena caches and superseded intermediate measurements."""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARENA_OUTPUT = ROOT / "output" / "arena-validation"
KEEP_LATENCY = {
    "latency-10p-lan-90hz-final-2026-10-02.json",
    "latency-10p-browser-final-2026-10-02.json",
    "latency-10p-lan-v62-2026-10-02.json",
    "latency-10p-host-10min-v62-2026-10-02.json",
}
SAFE_DIRECTORIES = (
    ROOT / ".playwright-cli",
    ROOT / ".pytest_cache",
    ROOT / "test-results",
    ROOT / "tmp",
    ROOT / "backend" / "__pycache__",
)


def _inside_root(path: Path) -> bool:
    try:
        path.resolve().relative_to(ROOT.resolve())
        return True
    except ValueError:
        return False


def _project_file_count() -> int:
    return sum(len(files) for _, _, files in os.walk(ROOT, followlinks=False))


def _remove(path: Path, dry_run: bool, removed: list[str], skipped: list[str]) -> None:
    if not path.exists():
        return
    if not _inside_root(path):
        skipped.append(f"outside-root: {path}")
        return
    if dry_run:
        removed.append(str(path.relative_to(ROOT)))
        return
    try:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
        removed.append(str(path.relative_to(ROOT)))
    except OSError as exc:
        skipped.append(f"locked: {path.relative_to(ROOT)} ({exc})")


def clean(dry_run: bool = False) -> dict:
    removed: list[str] = []
    skipped: list[str] = []
    for directory in SAFE_DIRECTORIES:
        _remove(directory, dry_run, removed, skipped)
    if ARENA_OUTPUT.exists():
        for log in ARENA_OUTPUT.glob("*.log"):
            _remove(log, dry_run, removed, skipped)
        for report in ARENA_OUTPUT.glob("latency-10p-*.json"):
            if report.name not in KEEP_LATENCY:
                _remove(report, dry_run, removed, skipped)
    result = {
        "project": str(ROOT),
        "dry_run": dry_run,
        "file_count": _project_file_count(),
        "removed": removed,
        "skipped": skipped,
        "remaining_arena_logs": sorted(path.name for path in ARENA_OUTPUT.glob("*.log")),
        "remaining_latency_reports": sorted(
            path.name for path in ARENA_OUTPUT.glob("latency-10p-*.json")
        ),
    }
    if not dry_run:
        cleanup_record = ARENA_OUTPUT / "arena-cleanup.json"
        existing = {}
        if cleanup_record.exists():
            try:
                existing = json.loads(cleanup_record.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                existing = {}
        existing.update({"cleanup_tool": result})
        cleanup_record.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
                                  encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="list safe removals without deleting")
    args = parser.parse_args()
    print(json.dumps(clean(dry_run=args.dry_run), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
