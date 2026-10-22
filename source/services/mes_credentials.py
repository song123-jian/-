"""Windows CurrentUser DPAPI storage, isolated from cloud and price data."""
from __future__ import annotations

import json
from pathlib import Path

from credentials import protect, unprotect

from .price_service import atomic_bytes


class MesCredentialError(ValueError):
    pass


class MesCredentialStore:
    def __init__(self, folder):
        self.path = Path(folder) / "mes_credentials.json"

    @staticmethod
    def _validate(username, password):
        if (not isinstance(username, str) or not username.strip() or len(username) > 120
                or not isinstance(password, str) or not password or len(password) > 256
                or any(ord(c) < 32 for c in username + password)):
            raise MesCredentialError("MES 登录信息无效，请重新输入账号和密码")
        return username.strip(), password

    def load(self):
        try:
            if not self.path.exists():
                return None
            if self.path.stat().st_size > 32768:
                raise ValueError
            envelope = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(envelope, dict) or envelope.get("version") != 1:
                raise ValueError
            payload = json.loads(unprotect(envelope["protected"]))
            return self._validate(payload["username"], payload["password"])
        except (OSError, ValueError, TypeError, KeyError):
            raise MesCredentialError("无法读取已保存的 MES 登录信息，请在当前 Windows 用户下重新登录或清除保存") from None

    def save(self, username, password):
        username, password = self._validate(username, password)
        try:
            payload = json.dumps({"username": username, "password": password}, ensure_ascii=False)
            envelope = {"version": 1, "protected": protect(payload)}
            atomic_bytes(self.path, json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8"))
        except (OSError, ValueError, TypeError):
            raise MesCredentialError("MES 已登录，但无法加密保存登录信息；请检查当前用户和数据目录权限") from None

    def clear(self):
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            raise MesCredentialError("无法清除已保存的 MES 登录信息，请检查数据目录权限") from None
