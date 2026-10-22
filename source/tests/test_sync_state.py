from services.sync_service import SyncState


def meta(version='1', day='2026-10-13', epoch='one'):
    return dict(schema_epoch=epoch, owner_id='owner', data_version=version, business_date=day)


def test_only_applied_snapshot_marks_token_read_and_midnight_changes_it():
    state = SyncState()
    assert state.observe(meta())
    assert state.token is None
    state.applied(meta())
    assert not state.observe(meta())
    assert state.observe(meta(day='2026-10-14'))
    assert state.observe(meta(epoch='restored'))
    assert state.observe(meta(version='2'))


def test_failure_backoff_resets_on_success():
    state = SyncState()
    assert state.failed() == 30_000
    assert state.failed() == 60_000
    assert state.failed() == 60_000
    state.observe(meta())
    assert state.failures == 0
