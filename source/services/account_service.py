"""Supabase Auth sessions and Windows-encrypted remembered app credentials."""
from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from credentials import protect, unprotect
from domain import ASSETS, NetworkError, ValidationError
from services.price_service import atomic_bytes


def project_config():
    message = '程序登录配置无效，请使用完整安装包'
    try:
        config = json.loads((ASSETS / 'account_config.json').read_text(encoding='utf-8'))
        if not isinstance(config, dict):
            raise ValueError
        url = config.get('url')
        key = config.get('publishable_key')
        username_domain = config.get('username_domain')
        if not isinstance(url, str):
            raise ValueError
        parsed = urllib.parse.urlsplit(url)
        port = parsed.port
    except (OSError, TypeError, ValueError):
        raise ValidationError(message) from None
    if (parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.supabase.co')
            or parsed.hostname.split('.', 1)[0].lower() in {'your-project', 'project-ref', 'example'}
            or parsed.username or parsed.password or port or parsed.path not in ('', '/')
            or parsed.query or parsed.fragment
            or not isinstance(key, str) or not re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]+', key)
            or 'replace' in key.lower() or username_domain != 'price-manager.invalid'):
        raise ValidationError(message)
    return config


def username_checked(value):
    name = value.strip().lower() if isinstance(value, str) else ''
    if not re.fullmatch(r'[a-z0-9_]{3,32}', name):
        raise ValidationError('账号须为3至32位字母、数字或下划线')
    return name


def password_checked(value):
    if not isinstance(value, str) or not 6 <= len(value) <= 256 or any(ord(c) < 32 for c in value):
        raise ValidationError('请输入6至256位密码')
    return value


class RegisteredAccountError(ValidationError):
    """The account exists, but the follow-up login could not be completed."""

    def __init__(self, message, *, category="login_failed"):
        super().__init__(message)
        self.category = category


def registration_request(config, username, password):
    messages = {
        'account_exists':'账号已存在，请更换账号或返回登录',
        'capacity_full':'15人名额已满，请联系管理人员',
        'invalid_username':'账号须为3至32位字母、数字或下划线',
        'invalid_password':'请输入6至256位密码',
        'registration_unknown':'注册结果暂未确认，请返回登录尝试；无法登录时再重试注册',
        'registration_unavailable':'注册服务暂不可用，请稍后重试',
    }
    request = urllib.request.Request(config['url'] + '/functions/v1/pmu-register',
        headers={'apikey':config['publishable_key'], 'Content-Type':'application/json', 'Accept':'application/json'},
        data=json.dumps({'username':username,'password':password},ensure_ascii=False).encode('utf-8'),method='POST')
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read(4097)
            if len(raw)>4096:
                raise ValueError
            payload = json.loads(raw)
        if not isinstance(payload,dict) or payload.get('created') is not True or payload.get('username')!=username:
            raise ValueError
        return str(uuid.UUID(payload['user_id']))
    except urllib.error.HTTPError as exc:
        if exc.code==404:
            raise ValidationError('注册服务尚未部署，请联系管理人员完成初始化') from None
        if exc.code==429:
            raise ValidationError('注册尝试过于频繁，请稍后重试') from None
        try:
            payload=json.loads(exc.read(4096))
            message=messages.get(payload.get('code')) if isinstance(payload,dict) else None
        except (ValueError, UnicodeDecodeError):
            message=None
        raise ValidationError(message or '注册服务暂不可用，请稍后重试') from None
    except (urllib.error.URLError, OSError, TimeoutError):
        raise NetworkError('注册结果暂未确认，请检查网络并返回登录尝试；无法登录时再重试注册') from None
    except (ValueError, TypeError, KeyError):
        raise ValidationError(messages['registration_unknown']) from None


def auth_request(config, route, body=None, *, token=None, method=None):
    headers = {'apikey':config['publishable_key'], 'Content-Type':'application/json', 'Accept':'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(config['url'] + route, headers=headers,
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8'),
        method=method or ('GET' if body is None else 'POST'))
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = response.read(128 * 1024 + 1)
            if len(data) > 128 * 1024:
                raise ValidationError('登录响应异常，请重新登录')
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise ValidationError('登录尝试过于频繁，请稍后重试') from None
        raise ValidationError('账号或密码错误，或登录已失效，请重新登录') from None
    except (urllib.error.URLError, OSError, TimeoutError):
        raise NetworkError('无法连接登录服务，请检查网络后重试') from None
    except (ValueError, UnicodeDecodeError):
        raise ValidationError('登录响应异常，请重新登录') from None


@dataclass(repr=False)
class AuthSession:
    config: dict = field(repr=False)
    user_id: str
    username: str
    access_token: str = field(repr=False)
    refresh_token: str = field(repr=False)
    expires_at: float
    lock: object = field(default_factory=threading.RLock, repr=False)
    closed: bool = False

    def token(self):
        with self.lock:
            if self.closed:
                raise ValidationError('账号已退出，请重新登录')
            if time.time() >= self.expires_at - 60:
                payload = auth_request(self.config, '/auth/v1/token?grant_type=refresh_token',
                                       {'refresh_token':self.refresh_token})
                if str(payload.get('user', {}).get('id')) != self.user_id:
                    self.close()
                    raise ValidationError('登录身份已失效，请重新登录')
                self.access_token = payload['access_token']
                self.refresh_token = payload['refresh_token']
                self.expires_at = time.time() + int(payload['expires_in'])
            return self.access_token

    def close(self):
        with self.lock:
            token = self.access_token
            self.closed = True
            self.access_token = self.refresh_token = ''
        if token:
            try:
                auth_request(self.config, '/auth/v1/logout?scope=local', token=token, method='POST')
            except ValueError:
                pass


class AccountService:
    def __init__(self, config=None):
        self.config = config or project_config()

    def login(self, username, password):
        username = username_checked(username)
        password = password_checked(password)
        payload = auth_request(self.config, '/auth/v1/token?grant_type=password',
            {'email':username + '@' + self.config['username_domain'], 'password':password})
        try:
            user_id = str(uuid.UUID(payload['user']['id']))
            session = AuthSession(self.config, user_id, username, payload['access_token'], payload['refresh_token'],
                                  time.time() + int(payload['expires_in']))
        except (ValueError, TypeError, KeyError):
            raise ValidationError('登录响应异常，请重新登录') from None
        try:
            rows = auth_request(self.config, '/rest/v1/pmu_members?select=user_id,username,enabled', token=session.token())
            if len(rows) != 1 or rows[0].get('user_id') != user_id or rows[0].get('username') != username or rows[0].get('enabled') is not True:
                raise ValidationError('该账号尚未开通或已停用，请联系管理人员')
        except Exception:
            session.close()
            raise
        return session

    def register(self, username, password, confirmation):
        username = username_checked(username)
        password = password_checked(password)
        if password != confirmation:
            raise ValidationError('两次输入的密码不一致')
        user_id = registration_request(self.config, username, password)
        try:
            session = self.login(username,password)
        except NetworkError:
            raise RegisteredAccountError(
                '账号已注册，但自动登录遇到网络问题，请稍后返回登录；不要重复注册', category="network") from None
        except ValueError:
            raise RegisteredAccountError(
                '账号已注册，但自动登录未完成，请返回登录核对账号状态；不要重复注册',
                category="authentication") from None
        if session.user_id!=user_id:
            session.close()
            raise RegisteredAccountError('账号已注册，但登录身份不匹配，请返回登录核对；不要重复注册',
                                         category="identity_mismatch")
        return session


class LoginCredentialStore:
    def __init__(self, folder):
        self.path = Path(folder) / 'login_credentials.json'

    def load(self):
        try:
            if not self.path.exists():
                return None
            if self.path.stat().st_size > 32768:
                raise ValueError
            envelope = json.loads(self.path.read_text(encoding='utf-8'))
            if envelope.get('version') != 1:
                raise ValueError
            payload = json.loads(unprotect(envelope['protected']))
            return username_checked(payload['username']), password_checked(payload['password'])
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            raise ValidationError('无法读取已保存的程序登录，请重新输入或清除保存') from None

    def save(self, username, password):
        username, password = username_checked(username), password_checked(password)
        try:
            payload = json.dumps({'username':username, 'password':password}, ensure_ascii=False)
            content = json.dumps({'version':1, 'protected':protect(payload)}, indent=2).encode('utf-8')
            atomic_bytes(self.path, content)
        except (OSError, ValueError, TypeError):
            raise ValidationError('已登录，但无法加密保存账号密码，请检查数据目录权限') from None

    def clear(self):
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            raise ValidationError('无法清除已保存登录，请检查数据目录权限') from None
