"""Registration failures must never leak credentials or repeat account creation."""
import io
import json
import urllib.error
from types import SimpleNamespace

import pytest

from domain import NetworkError, ValidationError
from services import account_service
from services.account_service import AccountService, RegisteredAccountError, registration_request

CONFIG={'url':'https://qa.supabase.co','publishable_key':'sb_publishable_isolated','username_domain':'price-manager.invalid'}


def test_mismatched_password_has_no_network_side_effect(monkeypatch):
    monkeypatch.setattr(account_service,'registration_request',lambda *args:pytest.fail('Unexpected account creation'))
    with pytest.raises(ValueError,match='不一致'):
        AccountService(CONFIG).register('qa_user','isolated-password','other-password')


def test_registration_automatically_authenticates_exact_created_identity(monkeypatch):
    calls=[]
    monkeypatch.setattr(account_service,'registration_request',lambda c,u,p:calls.append(u) or '00000000-0000-4000-8000-000000000001')
    current=SimpleNamespace(user_id='00000000-0000-4000-8000-000000000001')
    monkeypatch.setattr(AccountService,'login',lambda self,u,p:current)
    assert AccountService(CONFIG).register(' QA_User ','isolated-password','isolated-password') is current
    assert calls==['qa_user']


def test_login_failure_after_creation_prompts_login_without_reregister(monkeypatch):
    monkeypatch.setattr(account_service,'registration_request',lambda *args:'00000000-0000-4000-8000-000000000001')
    def unavailable(*args):
        raise ValueError('upstream private details')
    monkeypatch.setattr(AccountService,'login',unavailable)
    with pytest.raises(RegisteredAccountError,match='账号已注册') as error:
        AccountService(CONFIG).register('qa_user','isolated-password','isolated-password')
    assert 'private' not in str(error.value)


@pytest.mark.parametrize(('failure', 'category'), [
    (NetworkError('private network details'), 'network'),
    (ValidationError('private authentication details'), 'authentication'),
])
def test_registered_account_classifies_follow_up_login_failure(monkeypatch, failure, category):
    calls = []
    monkeypatch.setattr(account_service, 'registration_request',
                        lambda *args: calls.append('register') or '00000000-0000-4000-8000-000000000001')
    monkeypatch.setattr(AccountService, 'login', lambda *args: (_ for _ in ()).throw(failure))

    with pytest.raises(RegisteredAccountError) as error:
        AccountService(CONFIG).register('qa_user', 'isolated-password', 'isolated-password')

    assert calls == ['register']
    assert error.value.category == category
    assert 'private' not in str(error.value)


@pytest.mark.parametrize(('status','body','message'),[
    (409,{'code':'account_exists'},'账号已存在'),
    (409,{'code':'capacity_full'},'名额已满'),
    (404,{'code':'NOT_FOUND'},'注册服务尚未部署'),
    (429,{},'过于频繁'),
    (503,{'code':'registration_unknown'},'结果暂未确认'),
    (500,{'message':'private-secret'},'暂不可用'),
])
def test_registration_http_failure_uses_only_allowlisted_messages(monkeypatch,status,body,message):
    def rejected(request,**kwargs):
        assert request.headers['Apikey']==CONFIG['publishable_key']
        assert 'Authorization' not in request.headers
        raise urllib.error.HTTPError(request.full_url,status,'private-secret',{},io.BytesIO(json.dumps(body).encode()))
    monkeypatch.setattr('urllib.request.urlopen',rejected)
    with pytest.raises(ValueError,match=message) as error:
        registration_request(CONFIG,'qa_user','isolated-password')
    assert 'private-secret' not in str(error.value)


def test_uncertain_network_creation_is_not_automatically_repeated(monkeypatch):
    calls=[]
    def unavailable(request,**kwargs):
        calls.append(request)
        raise urllib.error.URLError('isolated-password')
    monkeypatch.setattr('urllib.request.urlopen',unavailable)
    with pytest.raises(ValueError,match='返回登录尝试'):
        AccountService(CONFIG).register('qa_user','isolated-password','isolated-password')
    assert len(calls)==1
