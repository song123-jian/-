"""Requirements first: a managed profile must never expose legacy admin storage."""
import json

import pytest

from services.app_context import AppContext
from services.backend_service import BackendService
from storage.sqlite_store import SQLiteStore


def test_managed_account_cannot_switch_into_legacy_shared_database(tmp_path):
    context = AppContext(SQLiteStore(tmp_path, load_seed=False), tmp_path)
    context.account = {'id':'11111111-1111-4111-8111-111111111111','username':'user_a'}
    with pytest.raises(ValueError, match='账号'):
        BackendService(context).switch_backend('sqlite', generation=context.storage_generation)


def test_managed_account_status_never_offers_admin_key_or_project_switch(tmp_path):
    context = AppContext(SQLiteStore(tmp_path, load_seed=False), tmp_path)
    context.account = {'id':'11111111-1111-4111-8111-111111111111','username':'user_a'}
    status = BackendService(context).get_backend_status()
    assert status.get('managed_account') is True
    assert status['username'] == 'user_a'
    assert not status['has_key']


def test_managed_account_status_reports_its_authenticated_project(tmp_path):
    from services.backend_service import account_context

    class Session:
        user_id = '11111111-1111-4111-8111-111111111111'
        username = 'user_a'
        config = {
            'url': 'https://saodtwnvbanjlkwwivcb.supabase.co',
            'publishable_key': 'sb_publishable_isolated_only',
        }

    context = account_context(tmp_path, Session())
    status = BackendService(context).get_backend_status()
    assert status['managed_account'] is True
    assert status['url'] == Session.config['url']
    assert not status['has_key']


def test_profile_paths_are_account_scoped_and_do_not_create_seed(tmp_path):
    from services import backend_service
    assert hasattr(backend_service, 'account_context'), 'Missing authenticated isolated profile factory'
    class Session:
        user_id = '11111111-1111-4111-8111-111111111111'
        username = 'user_a'
        config = {'url':'https://qa.supabase.co', 'publishable_key':'sb_publishable_isolated_only'}
    context = backend_service.account_context(tmp_path, Session())
    assert context.folder == tmp_path / 'profiles' / Session.user_id
    assert context.shared_folder == tmp_path
    assert not (context.folder / 'prices.sqlite3').exists()
    assert context.store.backend == 'supabase'
    assert 'protected' not in json.dumps(context.account)
