"""Existing price adapter bound to an authenticated owner and personal tables."""
from __future__ import annotations

import threading
import time

from domain import NetworkError, ValidationError, business_date, money, now, today
from storage.supabase_store import SupabaseStore


class AccountStore(SupabaseStore):
    def __init__(self, folder, session):
        self.folder = folder
        self.path = '个人云端报价'
        self.session = session
        self.url = session.config['url']
        self.key = session.config['publishable_key']
        self.lock = threading.RLock()
        self._missing_read_apis = set()
        self._sync_lock = threading.RLock()
        self._sync_meta = None
        self._sync_unavailable = False
        self._sync_retry_at = 0.0

    def request_headers(self):
        return {'apikey':self.key, 'Authorization':'Bearer ' + self.session.token(),
                'Accept':'application/json', 'Content-Type':'application/json'}

    def authorization_error_message(self):
        return '程序登录已失效或账号已停用，请退出账号后重新登录；仍失败请联系管理人员'

    def request(self, route, body=None, count=False):
        path, separator, query = route.partition('?')
        if path.startswith('rpc/pm_'):
            path = 'rpc/pmu_' + path[len('rpc/pm_'):]
        elif path in ('pm_quotes', 'pm_customers', 'pm_customer_audit', 'pm_settings'):
            path = 'pmu_' + path[3:]
        else:
            raise ValidationError('账号模式禁止访问共享数据库')
        return super().request(path + (separator + query if separator else ''), body, count)

    def seed_summary(self):
        return {'records':0, 'customers':0, 'source':'个人账号独立数据'}

    def check(self):
        result = super().check()
        rows, _ = self.request('pm_settings?select=value&key=eq.multiuser_version')
        if not rows or rows[0].get('value') != '1.7.0':
            raise ValidationError('个人账号数据库尚未就绪，请联系管理人员')
        result['message'] = '个人云端数据库已连接，数据按账号隔离'
        return result

    def sync_meta(self):
        with self._sync_lock:
            if self._sync_unavailable and time.monotonic() < self._sync_retry_at:
                return None
            try:
                result, _ = self.request('rpc/pm_sync_meta_v1', {})
            except ValueError as exc:
                # Only a missing sync RPC permits the existing manual-refresh mode.
                if isinstance(exc, (ValidationError, NetworkError)) or '尚未就绪' not in str(exc):
                    raise
                self._mark_sync_missing()
                return None
            self._validate_sync(result)
            self._sync_unavailable = False
            return result

    def _mark_sync_missing(self):
        self._sync_unavailable = True
        self._sync_retry_at = time.monotonic() + 60

    @staticmethod
    def _validate_sync(result):
        if not isinstance(result, dict) or not str(result.get('data_version', '')).isdigit() or not result.get('schema_epoch'):
            raise ValidationError('云端同步版本格式无效')
        business_date(result.get('business_date'))

    def business_day(self):
        meta = self.sync_meta()
        return meta['business_date'] if meta else today()

    def list(self, filters=None):
        with self._sync_lock:
            if self._sync_unavailable:
                result = super().list(filters)
                result['sync'] = {'available': False, 'message': '云端同步待升级；每60秒重检，可手动刷新'}
                return result
            try:
                snapshot, _ = self.request('rpc/pm_mobile_snapshot_v1', {})
            except ValueError as exc:
                if isinstance(exc, NetworkError) or '尚未就绪' not in str(exc):
                    raise
                self._mark_sync_missing()
                return self.list(filters)
            self._validate_sync(snapshot)
            if not isinstance(snapshot.get('quotes'), list):
                raise ValidationError('云端同步快照格式无效')
            rows = []
            for raw in snapshot['quotes']:
                row = dict(raw)
                row['id'] = int(row['id'])
                row['customer_revision'] = int(row['customer_revision'])
                row['price'] = money(row['price'])
                if row.get('previous_price') is not None:
                    row['previous_price'] = money(row['previous_price'])
                rows.append(row)
            result = self.filter_current(self.decorate_ranked(rows, snapshot['business_date']), filters)
            self._sync_meta = {key: snapshot[key] for key in ('owner_id', 'data_version', 'schema_epoch', 'business_date', 'server_time')}
            result['sync'] = {**self._sync_meta, 'available': True, 'last_read_at': now()}
            return result

    def refresh(self, filters=None):
        # Explicit refresh must discover a just-installed cloud upgrade immediately.
        with self._sync_lock:
            self._sync_unavailable = False
            result = self.list()
        meta = self.meta_from_result(result)
        if result.get('sync', {}).get('available'):
            meta['today'] = result['sync']['business_date']
        filtered = self.filter_current(result['items'], filters)
        filtered['sync'] = result.get('sync')
        return {'meta': meta, 'quotes': filtered}
