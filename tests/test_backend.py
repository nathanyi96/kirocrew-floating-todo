"""End-to-end tests: real server on an ephemeral port, real HTTP, temp data file."""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ["FLOATING_TODO_DEV"] = "1"

import server  # noqa: E402


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = server.Store(Path(self.tmp.name) / "todos.json")
        self.httpd = server.make_server(0, self.store)
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def call(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_add_toggle_delete(self):
        day = date.today().isoformat()
        code, item = self.call("POST", "/todos", {"text": "  write   doc "})
        self.assertEqual((code, item["text"], item["done"]), (201, "write doc", False))
        code, item = self.call("PATCH", f"/todos/{item['id']}", {"done": True})
        self.assertTrue(item["done"] and item["doneAt"])
        view = self.call("GET", f"/todos?date={day}")[1]
        self.assertEqual(len(view["items"]), 1)
        self.assertEqual(view["history"][-1], {"date": day, "done": 1, "total": 1})
        self.assertEqual(self.call("DELETE", f"/todos/{item['id']}")[0], 200)
        self.assertEqual(self.call("DELETE", f"/todos/{item['id']}")[0], 404)

    def test_carryover_and_move(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        _, undone = self.call("POST", "/todos", {"text": "old", "date": yesterday})
        _, done = self.call("POST", "/todos", {"text": "old done", "date": yesterday})
        self.call("PATCH", f"/todos/{done['id']}", {"done": True})
        view = self.call("GET", "/todos")[1]
        self.assertEqual([t["id"] for t in view["carryover"]], [undone["id"]])
        self.call("PATCH", f"/todos/{undone['id']}", {"date": date.today().isoformat()})
        view = self.call("GET", "/todos")[1]
        self.assertEqual(view["carryover"], [])
        self.assertEqual(len(view["items"]), 1)

    def test_prefixes_are_stripped(self):
        for prefix in ("/apps/floating-todo/api", "/api/apps/floating-todo", "/api"):
            self.assertEqual(self.call("GET", prefix + "/health")[0], 200)

    def test_validation(self):
        self.assertEqual(self.call("POST", "/todos", {"text": ""})[0], 400)
        self.assertEqual(self.call("POST", "/todos", {"text": "x" * 201})[0], 400)
        self.assertEqual(self.call("POST", "/todos", {"text": "x", "date": "2026-13-45"})[0], 400)
        self.assertEqual(self.call("GET", "/todos?date=nope")[0], 400)
        self.assertEqual(self.call("PATCH", "/todos/aaaaaaaaaaaa", {"done": "yes"})[0], 400)
        self.assertEqual(self.call("PATCH", "/todos/aaaaaaaaaaaa", {"done": True})[0], 404)
        self.assertEqual(self.call("GET", "/nope")[0], 404)

    def test_oversized_body_rejected(self):
        req = urllib.request.Request(
            self.base + "/todos", data=b"x" * (server.MAX_BODY + 1), method="POST",
            headers={"Content-Type": "application/json"},
        )
        with self.assertRaises((urllib.error.HTTPError, ConnectionError)) as cm:
            urllib.request.urlopen(req)
        if isinstance(cm.exception, urllib.error.HTTPError):
            self.assertEqual(cm.exception.code, 413)

    def test_corrupt_file_is_preserved(self):
        self.store.path.write_text("{not json")
        self.assertEqual(self.call("GET", "/todos")[1]["items"], [])
        self.assertTrue(list(self.store.path.parent.glob("todos.corrupt-*")))


class AuthTest(unittest.TestCase):
    def test_unsigned_request_is_refused_without_dev_flag(self):
        os.environ.pop("FLOATING_TODO_DEV")
        try:
            tmp = tempfile.TemporaryDirectory()
            httpd = server.make_server(0, server.Store(Path(tmp.name) / "t.json"))
            threading.Thread(target=httpd.serve_forever, daemon=True).start()
            base = f"http://127.0.0.1:{httpd.server_address[1]}"
            with urllib.request.urlopen(base + "/health") as r:
                self.assertEqual(r.status, 200)
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(base + "/todos")
            self.assertEqual(cm.exception.code, 401)
            httpd.shutdown()
            httpd.server_close()
            tmp.cleanup()
        finally:
            os.environ["FLOATING_TODO_DEV"] = "1"


if __name__ == "__main__":
    unittest.main()
