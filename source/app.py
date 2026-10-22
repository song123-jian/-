"""Local price manager. Runtime dependencies: Python standard library only."""
from __future__ import annotations

import argparse
import base64
import csv
import datetime as dt
import hashlib
import io
import json
import logging
import os
import secrets
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from contextlib import contextmanager
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler
from pathlib import Path

from credentials import protect, unprotect
from domain import ASSETS, FIELDS, TZ, Conflict, identity, import_key, now, today
from importer import clean, norm, read_prices, validate_record
from storage.sqlite_store import SQLiteStore as Store

VERSION = "1.0.1"
APP_ID = "local-price-manager"


class Server(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, store):
        self.store = store
        self.data_folder = store.folder
        self.token = secrets.token_urlsafe(32)
        self.storage_revision = secrets.token_urlsafe(16)
        self.operation_lock = threading.RLock()
        self.previews = {}
        self.preview_lock = threading.Lock()
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = "PriceManager/1.0"

    def log_message(self, fmt, *args):
        logging.info(fmt, *args)

    def allowed(self, write=False):
        port = self.server.server_address[1]
        hosts = (f"127.0.0.1:{port}", f"localhost:{port}")
        if self.headers.get("Host") not in hosts:
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://{host}" for host in hosts):
            return False
        return not write or secrets.compare_digest(self.headers.get("X-Price-Token", ""), self.server.token)

    def send(self, body, status=200, mime="application/json; charset=utf-8", filename=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if filename:
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{urllib.parse.quote(filename)}")
        self.end_headers()
        self.wfile.write(body)

    @staticmethod
    def csv_file(rows, columns):
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow([label for _, label in columns])
        for row in rows:
            values = []
            for key, _ in columns:
                value = str(row.get(key, ""))
                if key not in ("price", "source_row", "history_count") and value.lstrip().startswith(("=", "+", "-", "@")):
                    value = "'" + value
                values.append(value)
            writer.writerow(values)
        return output.getvalue().encode("utf-8")

    def do_GET(self):
        if not self.allowed():
            return self.send({"error": "仅允许本机访问"}, 403)
        parts = urllib.parse.urlsplit(self.path)
        path = parts.path
        params = {k: v[-1] for k, v in urllib.parse.parse_qs(parts.query).items()}
        try:
            if path == "/api/health":
                return self.send({"app": APP_ID, "version": VERSION, "status": "ready"})
            if path == "/api/backend":
                config = read_config(self.server.data_folder)
                return self.send({"backend": self.server.store.backend, "url": config.get("url", ""),
                                  "storage_revision": self.server.storage_revision,
                                  "has_key": bool(config.get("key")), "token": self.server.token})
            if path == "/api/schema":
                return self.send((ASSETS / "supabase.sql").read_bytes(), mime="text/plain; charset=utf-8", filename="Supabase建表与接口.sql")
            if path == "/api/meta":
                return self.send({**self.server.store.meta(), "token": self.server.token})
            if path == "/api/quotes":
                return self.send(self.server.store.list(params))
            if path == "/api/history":
                return self.send(self.server.store.history(int(params.get("id", "0"))))
            if path == "/api/backup":
                backup = self.server.store.backup("export")
                return self.send(backup.read_bytes(), mime="application/vnd.sqlite3", filename=backup.name)
            if path == "/api/template":
                columns = [(k, label) for k, label in zip(
                    ("customer", "material", "color", "grade", "price", "tax_type", "note", "effective_date"),
                    ("客户", "材料类别", "颜色", "牌号", "价格(元/kg)", "税口径", "备注", "更新日期"))]
                return self.send(self.csv_file([], columns), mime="text/csv; charset=utf-8", filename="价格导入模板.csv")
            if path == "/api/export":
                items = self.server.store.list(params)["items"]
                history = params.get("mode") == "history"
                if history:
                    keys = {r["identity"] for r in items}
                    items = [r for r in self.server.store.all() if r["identity"] in keys]
                columns = [("customer", "客户"), ("grade", "牌号"), ("material", "材料类别"), ("color", "颜色"),
                           ("price", "价格(元/kg)"), ("tax_type", "税口径"), ("effective_date", "更新日期"), ("note", "备注")]
                if history:
                    columns += [("reason", "调价原因"), ("created_at", "录入时间"), ("source_file", "来源文件"), ("source_sheet", "来源工作表"), ("source_row", "来源行")]
                else:
                    for row in items:
                        row["status"] = "待生效" if row["scheduled"] else "当前报价"
                    columns += [("status", "报价状态"), ("history_count", "历史记录数")]
                return self.send(self.csv_file(items, columns), mime="text/csv; charset=utf-8", filename=f"{'历史' if history else '当前'}价格-{today()}.csv")
            files = {"/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/app.css": ("app.css", "text/css; charset=utf-8"), "/lucide.min.js": ("lucide.min.js", "text/javascript; charset=utf-8")}
            if path in files:
                name, mime = files[path]
                return self.send((ASSETS / "static" / name).read_bytes(), mime=mime)
            if path == "/favicon.ico":
                return self.send(b"", status=204, mime="image/x-icon")
            return self.send({"error": "页面不存在"}, 404)
        except ValueError as exc:
            self.send({"error": str(exc)}, 400)
        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception:
            logging.exception("Read request failed")
            self.send({"error": "读取失败，请查看 data/app.log"}, 500)

    def do_POST(self):
        with self.server.operation_lock:
            self.handle_post()

    def handle_post(self):
        if not self.allowed(write=True):
            return self.send({"error": "操作校验失败，请刷新页面"}, 403)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size <= 0 or size > 29 * 1024 * 1024:
                raise ValueError("请求过大或为空；导入文件最大 20 MB")
            if self.headers.get_content_type() != "application/json":
                raise ValueError("请求格式应为 JSON")
            body = json.loads(self.rfile.read(size).decode("utf-8"))
            if not isinstance(body, dict):
                raise ValueError("请求内容无效")
            path = urllib.parse.urlsplit(self.path).path
            if path in ("/api/quotes", "/api/import/preview", "/api/import/commit") and body.get("_storage_revision", self.server.storage_revision) != self.server.storage_revision:
                raise Conflict("数据库已切换，请刷新页面后重新操作")
            if path in ("/api/backend/test", "/api/backend/save"):
                backend = body.get("backend", "supabase")
                if backend not in ("sqlite", "supabase"):
                    raise ValueError("请选择本地或 Supabase")
                if backend == "supabase":
                    url = clean(body.get("url"), 500).rstrip("/")
                    key = clean(body.get("key"), 8192)
                    old = read_config(self.server.data_folder)
                    if not key and url == old.get("url"):
                        key = old.get("key", "")
                    from supabase_backend import SupabaseStore
                    candidate = SupabaseStore(self.server.data_folder, url, key)
                    check = candidate.check()
                else:
                    url, key = "", ""
                    candidate = Store(self.server.data_folder)
                    check = {"message": "本地数据库可用"}
                if path.endswith("/test"):
                    return self.send(check)
                with self.server.store.lock:
                    if self.server.store.backend == "sqlite":
                        self.server.store.backup("before-backend-switch")
                    config = {"backend": backend, "url": url, "key_protected": protect(key) if key else ""}
                    target = self.server.data_folder / "config.local.json"
                    temporary = self.server.data_folder / "config.local.json.tmp"
                    temporary.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
                    temporary.replace(target)
                    self.server.store = candidate
                    self.server.storage_revision = secrets.token_urlsafe(16)
                    with self.server.preview_lock:
                        self.server.previews.clear()
                return self.send({"message": f"已切换到 {'Supabase 云数据库' if backend == 'supabase' else '本地数据库'}；报价不会自动迁移，请使用导入预览", "backend": backend})
            if path == "/api/quotes":
                return self.send(self.server.store.add(body))
            if path == "/api/import/preview":
                filename = clean(body.get("filename"), 250)
                filename = filename.replace("\\", "/").rsplit("/", 1)[-1]
                try:
                    raw = base64.b64decode(body.get("content", ""), validate=True)
                except (ValueError, TypeError):
                    raise ValueError("文件内容无效") from None
                if not raw or len(raw) > 20 * 1024 * 1024:
                    raise ValueError("导入文件应大于 0 且小于 20 MB")
                result = read_prices(raw, filename)
                fresh, skipped = self.server.store.preview(result["records"])
                preview_id = secrets.token_urlsafe(20)
                with self.server.preview_lock:
                    self.server.previews = {k: v for k, v in self.server.previews.items() if v[0] > time.monotonic()}
                    if len(self.server.previews) >= 12:
                        self.server.previews.pop(next(iter(self.server.previews)))
                    self.server.previews[preview_id] = (time.monotonic() + 600, result)
                return self.send({"preview_id": preview_id, "added": len(fresh), "skipped": skipped,
                                  "total": len(result["records"]) + len(result["errors"]), "omitted": result["omitted"],
                                  "sheet": result["sheet"], "errors": result["errors"][:50], "error_count": len(result["errors"]),
                                  "samples": fresh[:8]})
            if path == "/api/import/commit":
                with self.server.preview_lock:
                    pending = self.server.previews.pop(body.get("preview_id", ""), None)
                if not pending or pending[0] <= time.monotonic():
                    raise ValueError("导入预览已过期或已使用，请重新选择文件")
                if pending[1]["errors"]:
                    raise ValueError("存在错误行，修正表格后才能导入")
                return self.send(self.server.store.commit(pending[1]["records"]))
            if path == "/api/shutdown":
                self.send({"message": "程序已退出，所有已保存报价均已保留"})
                def stop():
                    time.sleep(0.2)
                    with self.server.store.lock:
                        self.server.shutdown()
                threading.Thread(target=stop, daemon=True).start()
                return
            self.send({"error": "操作不存在"}, 404)
        except Conflict as exc:
            self.send({"error": str(exc)}, 409)
        except (ValueError, UnicodeDecodeError) as exc:
            self.send({"error": str(exc)}, 400)
        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception:
            logging.exception("Write request failed")
            self.send({"error": "保存失败，原数据未被覆盖；请查看 data/app.log"}, 500)


from instance import instance_lock


def _legacy_main():
    parser = argparse.ArgumentParser(description="本地客户价格查询")
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--port", type=int, default=8877)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    root = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
    folder = (args.data_dir or root / "data").resolve()
    folder.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, handlers=[RotatingFileHandler(folder / "app.log", maxBytes=1024 * 1024, backupCount=2, encoding="utf-8")], format="%(asctime)s %(levelname)s %(message)s")
    lock_file = instance_lock(folder)
    if lock_file is None:
        try:
            runtime = json.loads((folder / "runtime.json").read_text(encoding="utf-8"))
            url = runtime["url"]
            if not recheck_local_url(url):
                raise ValueError("invalid local URL")
            with urllib.request.urlopen(url + "api/health", timeout=3) as response:
                if json.load(response).get("app") != APP_ID:
                    raise ValueError("wrong app")
            if not args.no_browser:
                webbrowser.open(url)
            return
        except Exception:
            raise RuntimeError("程序已启动或正在启动，请稍后再打开") from None
    server = None
    try:
        config = read_config(folder)
        if config.get("backend") == "supabase":
            from supabase_backend import SupabaseStore
            store = SupabaseStore(folder, config.get("url", ""), config.get("key", ""))
        else:
            store = Store(folder)
        try:
            server = Server(("127.0.0.1", args.port), store)
        except OSError:
            if args.port == 0:
                raise
            server = Server(("127.0.0.1", 0), store)
        url = f"http://127.0.0.1:{server.server_address[1]}/"
        (folder / "runtime.json").write_text(json.dumps({"url": url, "pid": os.getpid(), "version": VERSION}, ensure_ascii=False), encoding="utf-8")
        logging.info("Started version=%s url=%s", VERSION, url)
        if not args.no_browser:
            webbrowser.open(url)
        server.serve_forever(poll_interval=0.25)
    finally:
        if server:
            server.server_close()
        lock_file.close()
        try:
            runtime_path = folder / "runtime.json"
            runtime = json.loads(runtime_path.read_text(encoding="utf-8"))
            if runtime.get("pid") == os.getpid():
                runtime_path.unlink()
        except (FileNotFoundError, ValueError):
            pass
        logging.info("Stopped")


def recheck_local_url(url):
    parsed = urllib.parse.urlsplit(url)
    return parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and parsed.path == "/" and parsed.port is not None


def read_config(folder):
    path = folder / "config.local.json"
    if not path.exists():
        return {"backend": "sqlite"}
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict) or result.get("backend") not in ("sqlite", "supabase"):
        raise ValueError("data/config.local.json 格式无效")
    if result.get("key_protected"):
        result["key"] = unprotect(result["key_protected"])
    return result


def main():
    print("旧版浏览器入口已弃用并停用，请运行 source/desktop_main.py。", file=sys.stderr)
    raise SystemExit(2)


if __name__ == "__main__":
    sys.modules.setdefault("app", sys.modules[__name__])
    try:
        main()
    except Exception as exc:
        logging.exception("Startup failed")
        if os.name == "nt" and getattr(sys, "frozen", False):
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, f"启动失败：{exc}\n请将程序放在可写文件夹，检查 data/app.log。", "价格查询", 16)
        else:
            raise
