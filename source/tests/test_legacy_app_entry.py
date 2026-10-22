import pytest

import app


def test_legacy_browser_entry_is_deprecated_and_does_not_start_server(monkeypatch, tmp_path, capsys):
    started = []
    monkeypatch.setattr(app, "Server", lambda *_args, **_kwargs: started.append(True))
    monkeypatch.setattr(app.sys, "argv", [
        "app.py", "--data-dir", str(tmp_path / "isolated-data"), "--port", "0", "--no-browser"
    ])

    with pytest.raises(SystemExit) as stopped:
        app.main()

    assert stopped.value.code == 2
    message = capsys.readouterr().err
    assert "已弃用" in message
    assert "desktop_main.py" in message
    assert started == []
    assert not (tmp_path / "isolated-data").exists()
