"""Desktop synchronization must obey cloud dates and latest-version semantics."""
from domain import history_result
from storage.account_store import AccountStore


def test_missing_sync_rpc_is_rechecked_after_cloud_upgrade(tmp_path, monkeypatch):
    from types import SimpleNamespace

    import storage.account_store as module
    clock = [100.0]
    monkeypatch.setattr(module, 'time', SimpleNamespace(monotonic=lambda: clock[0]), raising=False)
    store = AccountStore(tmp_path, SimpleNamespace(config={'url': 'https://example.invalid', 'publishable_key': 'test'}))
    calls = []
    expected = dict(owner_id='owner', data_version='0', schema_epoch='epoch', business_date='2026-10-19')

    def request(route, body=None, count=False):
        calls.append(route)
        if len(calls) == 1:
            raise ValueError('Supabase 表或 RPC 尚未就绪，请先执行附带建表 SQL')
        return expected, ''

    store.request = request
    assert store.sync_meta() is None
    assert store.sync_meta() is None
    assert len(calls) == 1
    clock[0] += 61
    assert store.sync_meta() == expected
    assert len(calls) == 2
    assert not store._sync_unavailable


def test_history_uses_authoritative_business_date():
    rows = [{'id': 2, 'price': '11', 'effective_date': '2026-10-14', 'source_type': '手工录入'},
            {'id': 1, 'price': '10', 'effective_date': '2026-10-13', 'source_type': '手工录入'}]
    result = history_result(rows, cutoff='2026-10-13')
    assert result['items'][0]['scheduled'] and not result['items'][0]['is_current']
    assert result['items'][1]['is_current']


def test_account_list_decorates_snapshot_using_server_date_without_local_clock(tmp_path):
    store = AccountStore.__new__(AccountStore)
    store.folder = tmp_path
    store._sync_meta = None
    store._sync_unavailable = False
    import threading
    store._sync_lock = threading.RLock()
    store._missing_read_apis = set()
    calls = []

    def request(route, body=None, count=False):
        calls.append(route)
        return {'owner_id': 'owner', 'data_version': '7', 'schema_epoch': 'epoch', 'business_date': '2026-10-13',
                'server_time': '2026-10-13T12:00:00+08:00', 'customers': [],
                'quotes': [{'id': '5', 'identity': 'a'*64, 'customer': '客户', 'grade': 'PA6', 'material': 'PA6',
                            'color': '', 'tax_type': '含税', 'price': '9.734513', 'effective_date': '2026-10-14',
                            'source_type': '手工录入', 'note': '', 'customer_revision': '1', 'history_count': 1,
                            'future_count': 1, 'previous_price': None, 'previous_date': None, 'previous_source_type': None}]}, ''
    store.request = request
    assert 'list' in AccountStore.__dict__, 'Personal cloud list has no authoritative snapshot implementation'
    result = store.list()
    assert result['items'][0]['scheduled']
    assert isinstance(result['items'][0]['id'], int)
    assert result['sync']['data_version'] == '7'
    assert calls == ['rpc/pm_mobile_snapshot_v1']
