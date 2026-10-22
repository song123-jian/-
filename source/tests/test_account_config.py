import json

import pytest

from services import account_service

VALID_CONFIG = {
    "url": "https://qa-contract.supabase.co",
    "publishable_key": "sb_publishable_qa_contract_test_key_123456789",
    "username_domain": "price-manager.invalid",
    "max_users": 3,
}


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("url", "https://your-project.supabase.co"),
        ("publishable_key", "sb_publishable_REPLACE_ME"),
        ("username_domain", "example.invalid"),
    ],
)
def test_project_config_rejects_placeholder_values(tmp_path, monkeypatch, field, value):
    config = {**VALID_CONFIG, field: value}
    (tmp_path / "account_config.json").write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setattr(account_service, "ASSETS", tmp_path)

    with pytest.raises(ValueError, match="程序登录配置无效"):
        account_service.project_config()


def test_project_config_accepts_complete_supabase_client_config(tmp_path, monkeypatch):
    (tmp_path / "account_config.json").write_text(json.dumps(VALID_CONFIG), encoding="utf-8")
    monkeypatch.setattr(account_service, "ASSETS", tmp_path)

    assert account_service.project_config() == VALID_CONFIG


@pytest.mark.parametrize('url', [123, [], {}, None, True])
def test_project_config_rejects_non_text_url(tmp_path, monkeypatch, url):
    (tmp_path / 'account_config.json').write_text(json.dumps({**VALID_CONFIG, 'url': url}), encoding='utf-8')
    monkeypatch.setattr(account_service, 'ASSETS', tmp_path)

    with pytest.raises(ValueError, match='程序登录配置无效'):
        account_service.project_config()
