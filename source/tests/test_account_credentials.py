"""Actual Windows encryption and account-session ownership boundaries."""
import io
import time
import urllib.error

import pytest

from services import account_service
from services.account_service import AuthSession, LoginCredentialStore
from storage.account_store import AccountStore


def test_remembered_application_login_uses_dpapi_and_can_be_cleared(tmp_path):
    saved = LoginCredentialStore(tmp_path)
    assert saved.load() is None
    saved.save('test_user','isolated-secret-abcdef')
    content = saved.path.read_bytes()
    assert b'test_user' not in content and b'isolated-secret-abcdef' not in content
    assert saved.load() == ('test_user','isolated-secret-abcdef')
    saved.clear()
    assert saved.load() is None


@pytest.mark.parametrize('payload',[b'bad',b'{}',b'[]',b'{"version":1,"protected":"bad"}'])
def test_corrupt_login_never_leaks_crypto_payload(tmp_path,payload):
    saved = LoginCredentialStore(tmp_path)
    saved.path.write_bytes(payload)
    with pytest.raises(ValueError,match='重新输入'):
        saved.load()


def test_encryption_failure_preserves_existing_saved_login(tmp_path,monkeypatch):
    saved = LoginCredentialStore(tmp_path)
    saved.save('test_user','isolated-secret-abcdef')
    before = saved.path.read_bytes()
    def broken(_):
        raise ValueError('secret should not appear')
    monkeypatch.setattr(account_service,'protect',broken)
    with pytest.raises(ValueError,match='无法加密') as error:
        saved.save('other_user','different-secret-abcdef')
    assert 'secret should not appear' not in str(error.value)
    assert saved.path.read_bytes()==before


def session(**changes):
    args = {'config':{'url':'https://qa.supabase.co','publishable_key':'sb_publishable_isolated'},
            'user_id':'11111111-1111-4111-8111-111111111111','username':'test_user',
            'access_token':'private_access','refresh_token':'private_refresh','expires_at':time.time()+3600}
    args.update(changes)
    return AuthSession(**args)


def test_refresh_cannot_replace_current_users_identity(monkeypatch):
    current = session(expires_at=0)
    def response(*args,**kwargs):
        return {'user':{'id':'22222222-2222-4222-8222-222222222222'}}
    monkeypatch.setattr(account_service,'auth_request',response)
    with pytest.raises(ValueError,match='身份'):
        current.token()
    assert current.closed and not current.access_token and not current.refresh_token


def test_ordinary_adapter_sends_user_jwt_without_admin_key(tmp_path):
    current = session()
    store = AccountStore(tmp_path,current)
    headers = store.request_headers()
    assert headers['apikey']=='sb_publishable_isolated'
    assert headers['Authorization']=='Bearer private_access'
    assert 'private' not in repr(current)
    for route in ('pm_members','other_table','rpc/other_function'):
        with pytest.raises(ValueError,match='共享'):
            store.request(route)


def test_business_document_aliases_target_deployed_pmu_rpc_routes(tmp_path, monkeypatch):
    store = AccountStore(tmp_path, session())
    calls = []

    def fake_request(_store, route, body=None, count=False):
        calls.append((route, body, count))
        if route.endswith('business_document_list_v1'):
            return {'records': []}, ''
        if route.endswith('save_business_document_v1'):
            return {'document': {}}, ''
        return {'deleted': True}, ''

    monkeypatch.setattr('storage.supabase_store.SupabaseStore.request', fake_request)
    store.business_document_list('quotation')
    store.business_document_save('quotation', None, None, '测试记录', {'kind': 'quotation'})
    store.business_document_delete('quotation', '11111111-1111-4111-8111-111111111111', 1)

    assert [route for route, _body, _count in calls] == [
        'rpc/pmu_business_document_list_v1',
        'rpc/pmu_save_business_document_v1',
        'rpc/pmu_delete_business_document_v1',
    ]
    assert calls[1][1]['p_expected_revision'] is None
    assert calls[2][1]['p_expected_revision'] == 1


def test_closed_session_cannot_authenticate_background_request():
    current = session(access_token='',refresh_token='')
    current.close()
    with pytest.raises(ValueError,match='退出'):
        current.token()


def test_login_network_diagnostics_exclude_authentication_data(monkeypatch,caplog):
    from domain import NetworkError
    def unavailable(*args,**kwargs):
        raise urllib.error.URLError(TimeoutError('isolated-private-network-detail'))
    monkeypatch.setattr('urllib.request.urlopen',unavailable)
    with pytest.raises(NetworkError,match='无法连接登录服务'):
        account_service.auth_request(session().config,'/auth/v1/token?grant_type=password',
                                     {'password':'isolated-private-password'},token='isolated-private-token')
    assert 'Account HTTPS connection failed (cause=TimeoutError' in caplog.text
    assert 'isolated-private' not in caplog.text
    assert 'sb_publishable_isolated' not in caplog.text


@pytest.mark.parametrize('status',[401,403])
def test_account_permission_error_directs_relogin_without_admin_key(tmp_path,monkeypatch,status):
    store=AccountStore(tmp_path,session())
    def denied(*args,**kwargs):
        raise urllib.error.HTTPError('https://qa.supabase.co',status,'denied',{},io.BytesIO(b'{"code":"42501"}'))
    monkeypatch.setattr('urllib.request.urlopen',denied)
    with pytest.raises(ValueError,match='程序登录') as error:
        store.request('rpc/pm_export_snapshot',{})
    assert 'Secret' not in str(error.value) and 'service_role' not in str(error.value)
