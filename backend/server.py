"""Backend for floating-todo: a small per-day checklist stored in one JSON file.

Stdlib only. Binds 127.0.0.1. Requests must carry the gateway's
``X-KiroCrew-Proxy`` signature; set FLOATING_TODO_DEV=1 to skip that check
when running the server by hand.

Routes (the gateway prefix is stripped, so these work behind the proxy and
when called directly):

    GET    /health
    GET    /todos?date=YYYY-MM-DD   items for the day, carry-over, 7-day history
    POST   /todos                   {"text": str, "date"?: YYYY-MM-DD}
    PATCH  /todos/<id>              {"done"?: bool, "text"?: str, "date"?: YYYY-MM-DD}
    DELETE /todos/<id>
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

APP_NAME = os.environ.get("KIROCREW_APP_NAME", "floating-todo")
PORT = int(os.environ.get("PORT", 9100))

MAX_TEXT = 200
MAX_ITEMS = 5000
MAX_BODY = 16 * 1024
HISTORY_DAYS = 7
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PREFIXES = (f"/apps/{APP_NAME}/api", f"/api/apps/{APP_NAME}", "/api")


def data_file() -> Path:
    override = os.environ.get("FLOATING_TODO_DATA")
    if override:
        return Path(override)
    home = os.environ.get("KIROCREW_HOME")
    base = Path(home) / "apps" / APP_NAME / "data" if home else Path(__file__).resolve().parent.parent / "data"
    return base / "todos.json"


class Store:
    """JSON-file store. One lock; every write is a temp-file replace."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()

    def _load(self) -> list[dict]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []
        except (OSError, ValueError):
            # Keep the unreadable file for inspection instead of overwriting it.
            self.path.replace(self.path.with_suffix(f".corrupt-{int(time.time())}"))
            return []
        return [t for t in raw.get("items", []) if isinstance(t, dict)]

    def _save(self, items: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, self.path)

    def view(self, day: str) -> dict:
        with self.lock:
            items = self._load()
        today_items = [t for t in items if t["date"] == day]
        carry = [t for t in items if t["date"] < day and not t["done"]]
        start = (date.fromisoformat(day) - timedelta(days=HISTORY_DAYS - 1)).isoformat()
        history = []
        for i in range(HISTORY_DAYS):
            d = (date.fromisoformat(start) + timedelta(days=i)).isoformat()
            of_day = [t for t in items if t["date"] == d]
            history.append({"date": d, "done": sum(t["done"] for t in of_day), "total": len(of_day)})
        return {
            "date": day,
            "items": sorted(today_items, key=lambda t: t["createdAt"]),
            "carryover": sorted(carry, key=lambda t: (t["date"], t["createdAt"])),
            "history": history,
        }

    def add(self, text: str, day: str) -> dict:
        with self.lock:
            items = self._load()
            if len(items) >= MAX_ITEMS:
                raise ValueError("too many items")
            item = {
                "id": uuid.uuid4().hex[:12],
                "text": text,
                "done": False,
                "date": day,
                "createdAt": _now(),
                "doneAt": None,
            }
            items.append(item)
            self._save(items)
            return item

    def update(self, item_id: str, patch: dict) -> dict | None:
        with self.lock:
            items = self._load()
            item = next((t for t in items if t["id"] == item_id), None)
            if item is None:
                return None
            if "text" in patch:
                item["text"] = patch["text"]
            if "date" in patch:
                item["date"] = patch["date"]
            if "done" in patch and patch["done"] != item["done"]:
                item["done"] = patch["done"]
                item["doneAt"] = _now() if patch["done"] else None
            self._save(items)
            return item

    def delete(self, item_id: str) -> bool:
        with self.lock:
            items = self._load()
            kept = [t for t in items if t["id"] != item_id]
            if len(kept) == len(items):
                return False
            self._save(kept)
            return True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _valid_day(value: object) -> bool:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _clean_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = " ".join(value.split())
    return text if 0 < len(text) <= MAX_TEXT else None


def strip_prefix(path: str) -> str:
    for p in PREFIXES:
        if path == p or path.startswith(p + "/"):
            return path[len(p):] or "/"
    return path


def proxy_ok(headers, method: str, target: str, body: bytes) -> bool:
    """Fail closed: accept only requests signed by the gateway proxy."""
    if os.environ.get("FLOATING_TODO_DEV") == "1":
        return True
    try:
        from kiro_crew.apps.proxy_auth import verify_proxy_request
    except ImportError:
        return False
    return bool(
        verify_proxy_request(headers.get("X-KiroCrew-Proxy", ""), method=method, target=target, body=body)
    )


class Handler(BaseHTTPRequestHandler):
    store: Store

    def _send(self, code: int, data: object) -> None:
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _read_body(self) -> bytes | None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length < 0 or length > MAX_BODY:
            return None
        return self.rfile.read(length) if length else b""

    def _handle(self, method: str) -> None:
        body = self._read_body()
        if body is None:
            return self._send(413, {"error": "bad or oversized body"})
        parts = urlsplit(self.path)
        route = strip_prefix(parts.path)
        if route != "/health" and not proxy_ok(self.headers, method, self.path, body):
            return self._send(401, {"error": "unauthorized"})

        payload: dict = {}
        if body:
            try:
                payload = json.loads(body)
            except ValueError:
                return self._send(400, {"error": "invalid JSON"})
            if not isinstance(payload, dict):
                return self._send(400, {"error": "JSON object expected"})

        if route == "/health" and method == "GET":
            return self._send(200, {"status": "ok", "app": APP_NAME})

        if route == "/todos" and method == "GET":
            day = parse_qs(parts.query).get("date", [date.today().isoformat()])[0]
            if not _valid_day(day):
                return self._send(400, {"error": "date must be YYYY-MM-DD"})
            return self._send(200, self.store.view(day))

        if route == "/todos" and method == "POST":
            text = _clean_text(payload.get("text"))
            day = payload.get("date", date.today().isoformat())
            if text is None:
                return self._send(400, {"error": f"text must be 1-{MAX_TEXT} characters"})
            if not _valid_day(day):
                return self._send(400, {"error": "date must be YYYY-MM-DD"})
            try:
                return self._send(201, self.store.add(text, day))
            except ValueError as exc:
                return self._send(409, {"error": str(exc)})

        m = re.fullmatch(r"/todos/([0-9a-f]{12})", route)
        if m and method == "PATCH":
            patch: dict = {}
            if "text" in payload:
                text = _clean_text(payload["text"])
                if text is None:
                    return self._send(400, {"error": f"text must be 1-{MAX_TEXT} characters"})
                patch["text"] = text
            if "done" in payload:
                if not isinstance(payload["done"], bool):
                    return self._send(400, {"error": "done must be a boolean"})
                patch["done"] = payload["done"]
            if "date" in payload:
                if not _valid_day(payload["date"]):
                    return self._send(400, {"error": "date must be YYYY-MM-DD"})
                patch["date"] = payload["date"]
            item = self.store.update(m.group(1), patch)
            return self._send(200, item) if item else self._send(404, {"error": "not found"})

        if m and method == "DELETE":
            return self._send(200, {"ok": True}) if self.store.delete(m.group(1)) else self._send(404, {"error": "not found"})

        self._send(404, {"error": "not found"})

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PATCH(self):
        self._handle("PATCH")

    def do_DELETE(self):
        self._handle("DELETE")

    def log_message(self, *args):
        pass


class Server(HTTPServer):
    """HTTPServer with SO_REUSEADDR off on Windows, so a port clash fails the bind."""

    allow_reuse_address = not sys.platform.startswith("win")


def make_server(port: int, store: Store) -> Server:
    handler = type("BoundHandler", (Handler,), {"store": store})
    return Server(("127.0.0.1", port), handler)


if __name__ == "__main__":
    print(f"{APP_NAME} backend on 127.0.0.1:{PORT}")
    make_server(PORT, Store(data_file())).serve_forever()
