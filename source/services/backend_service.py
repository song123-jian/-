"""Credential handling and atomic backend changes; no secret in UI results."""
from __future__ import annotations

import json
import secrets
from pathlib import Path

from credentials import protect, unprotect
from domain import NetworkError, ValidationError, clean
from services.price_service import atomic_bytes
from storage.sqlite_store import SQLiteStore
from storage.supabase_store import SupabaseStore

DEFAULT_URL = "https://fvnacayonhyretsqcqqc.supabase.co"


def account_context(folder, session):
    import uuid

    from services.app_context import AppContext
    from storage.account_store import AccountStore

    user_id = str(uuid.UUID(session.user_id))
    profile = Path(folder).resolve() / 'profiles' / user_id
    profile.mkdir(parents=True, exist_ok=True)
    context = AppContext(AccountStore(profile, session), profile)
    context.account = {'id':user_id, 'username':session.username}
    context.shared_folder = Path(folder).resolve()
    return context


def read_config(folder):
    path = Path(folder) / "config.local.json"
    if not path.exists():
        return {"backend": "sqlite"}
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise ValidationError("data/config.local.json 格式无效") from None
    if not isinstance(result, dict) or result.get("backend") not in ("sqlite", "supabase"):
        raise ValidationError("data/config.local.json 格式无效")
    return result


def create_store(folder):
    config = read_config(folder)
    if config["backend"] == "supabase":
        if not config.get("key_protected"):
            raise ValidationError("缺少云端凭据，请在当前 Windows 用户下重新配置")
        return SupabaseStore(folder, config.get("url", ""), unprotect(config["key_protected"]))
    return SQLiteStore(folder)


class BackendService:
    def __init__(self, context):
        self.context = context

    def get_backend_status(self):
        with self.context.state_lock:
            if getattr(self.context, 'account', None):
                return {'backend':'supabase', 'url':getattr(self.context.store, 'url', DEFAULT_URL), 'has_key':False, 'managed_account':True,
                        'username':self.context.account['username'], 'storage_generation':self.context.storage_generation}
            config = read_config(self.context.folder)
            return {"backend": self.context.store.backend, "url": config.get("url") or DEFAULT_URL,
                    "has_key": bool(config.get("key_protected")),
                    "storage_generation": self.context.storage_generation}

    def _candidate(self, backend, url, key):
        if getattr(self.context, 'account', None):
            raise ValidationError('独立账号模式使用个人云数据库，请通过退出账号切换使用者')
        if backend not in ("sqlite", "supabase"):
            raise ValidationError("请选择本地或 Supabase")
        if backend == "sqlite":
            candidate = SQLiteStore(self.context.folder)
            with candidate.connection() as db:
                if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValidationError("本地数据库完整性检查失败，请先恢复备份")
            return candidate, "", {"message": "本地数据库可用，完整性检查通过", "schema_version": "2"}
        url = clean(url, 500).rstrip("/")
        key = clean(key, 8192)
        config = read_config(self.context.folder)
        if not key and url == config.get("url") and config.get("key_protected"):
            key = unprotect(config["key_protected"])
        candidate = SupabaseStore(self.context.folder, url, key)
        return candidate, key, candidate.check()

    def test_backend(self, backend, url="", key=""):
        _, _, check = self._candidate(backend, url, key)
        return check

    def switch_backend(self, backend, url="", key="", generation=None):
        self.context.capture(generation)
        candidate, resolved_key, check = self._candidate(backend, url, key)
        with self.context.operation_lock:
            store, _ = self.context.capture(generation)
            warning = ""
            try:
                backup = store.backup("before-backend-switch")
            except NetworkError:
                if store.backend != "supabase" or backend != "sqlite":
                    raise
                backup = None
                warning = "云端网络不可用，本次未能创建云端快照。已按你的选择切回本地；云端记录未变更。"
            config = read_config(self.context.folder)
            config["backend"] = backend
            if backend == "supabase":
                config["url"] = candidate.url
                config["key_protected"] = protect(resolved_key)
            config.pop("key", None)
            with self.context.state_lock:
                atomic_bytes(self.context.folder / "config.local.json", json.dumps(config, ensure_ascii=False, indent=2).encode("utf-8"))
                self.context.store = candidate
                self.context.storage_generation = secrets.token_urlsafe(20)
                self.context.previews.clear()
                self.context.data_generation += 1
                captured = self.context.storage_generation
            return {"backend": backend, "message": warning or "已切换数据库；报价不会自动迁移，请使用导入预览",
                    "warning": warning, "backup": str(backup) if backup else None, "storage_generation": captured, "check": check}
