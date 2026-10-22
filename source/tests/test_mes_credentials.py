"""Real Windows DPAPI and failure handling in temporary data directories."""
import json

import pytest

from services.mes_credentials import MesCredentialError, MesCredentialStore


def test_encrypted_roundtrip_reopen_and_clear(tmp_path):
    store = MesCredentialStore(tmp_path)
    assert store.load() is None
    store.save("qa-mes-account", "qa-mes-secret")
    raw = store.path.read_bytes()
    assert b"qa-mes-account" not in raw and b"qa-mes-secret" not in raw
    assert MesCredentialStore(tmp_path).load() == ("qa-mes-account", "qa-mes-secret")
    assert json.loads(raw)["version"] == 1
    assert list(tmp_path.iterdir()) == [store.path]
    store.clear()
    assert not store.path.exists() and store.load() is None
    store.clear()


@pytest.mark.parametrize("contents", ['{', '[]', '{"version":2}', '{"version":1,"protected":"invalid"}', 'X' * 32769],
                         ids=["invalid-json", "wrong-type", "wrong-version", "bad-ciphertext", "oversized"])
def test_unreadable_payload_is_sanitized_and_can_be_cleared(tmp_path, contents):
    store = MesCredentialStore(tmp_path)
    store.path.write_text(contents, encoding="utf-8")
    with pytest.raises(MesCredentialError, match="无法读取") as exc:
        store.load()
    assert "invalid" not in str(exc.value) and "Supabase" not in str(exc.value)
    assert store.path.exists()
    store.clear()
    assert store.load() is None


def test_failed_save_keeps_last_good_ciphertext_and_sanitizes_error(tmp_path, monkeypatch):
    store = MesCredentialStore(tmp_path)
    store.save("qa-mes-account", "qa-mes-secret")
    before = store.path.read_bytes()

    def denied(*_):
        raise PermissionError("qa-sensitive-path")

    monkeypatch.setattr("services.mes_credentials.atomic_bytes", denied)
    with pytest.raises(MesCredentialError, match="无法加密保存") as exc:
        store.save("qa-mes-account", "replacement-secret")
    assert "sensitive" not in str(exc.value) and store.path.read_bytes() == before
    assert store.load() == ("qa-mes-account", "qa-mes-secret")


def test_encryption_failure_does_not_write_plaintext(tmp_path, monkeypatch):
    store = MesCredentialStore(tmp_path)
    monkeypatch.setattr("services.mes_credentials.protect", lambda _: (_ for _ in ()).throw(ValueError("internal-secret")))
    with pytest.raises(MesCredentialError, match="无法加密保存"):
        store.save("qa-mes-account", "qa-mes-secret")
    assert not store.path.exists() and not list(tmp_path.iterdir())


def test_failed_clear_is_reported(tmp_path, monkeypatch):
    store = MesCredentialStore(tmp_path)
    store.save("qa-mes-account", "qa-mes-secret")

    def denied(*_, **__):
        raise PermissionError("internal-secret")

    monkeypatch.setattr(type(store.path), "unlink", denied)
    with pytest.raises(MesCredentialError, match="无法清除") as exc:
        store.clear()
    assert "secret" not in str(exc.value)


@pytest.mark.parametrize("username,password", [("", "x"), ("user", ""), ("user\n", "secret"), ("u", "x" * 257)])
def test_invalid_credentials_never_write(tmp_path, username, password):
    store = MesCredentialStore(tmp_path)
    with pytest.raises(MesCredentialError, match="无效"):
        store.save(username, password)
    assert not store.path.exists()
