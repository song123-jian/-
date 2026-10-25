from importlib.util import find_spec

import pytest

from domain import ValidationError


def todo_service_type():
    assert find_spec("services.todo_service") is not None, "待办本地服务尚未实现"
    from services.todo_service import TodoService

    return TodoService


def test_todo_service_persists_edits_completion_and_deletion(tmp_path):
    TodoService = todo_service_type()
    service = TodoService(tmp_path)
    created = service.create({
        "title": "确认改性材料送样计划",
        "related": "汽车主机厂项目",
        "due_date": "2026-10-31",
        "priority": "high",
        "notes": "确认样件数量",
    })

    reopened = TodoService(tmp_path)
    assert reopened.list_items() == [created]
    assert created["completed"] is False

    updated = reopened.update(created["id"], {"title": "确认送样日期", "completed": True})
    assert updated["title"] == "确认送样日期"
    assert updated["completed"] is True
    assert TodoService(tmp_path).list_items() == [updated]

    assert reopened.delete(created["id"]) is True
    assert TodoService(tmp_path).list_items() == []


def test_todo_service_rejects_invalid_fields_and_preserves_corrupt_file(tmp_path):
    TodoService = todo_service_type()
    service = TodoService(tmp_path)

    for task in (
        {"title": "  "},
        {"title": "有效事项", "priority": "critical"},
        {"title": "有效事项", "due_date": "2026-02-30"},
    ):
        with pytest.raises(ValidationError):
            service.create(task)

    path = tmp_path / "todos.json"
    damaged = b"{not-json"
    path.write_bytes(damaged)
    with pytest.raises(ValidationError):
        service.list_items()
    assert path.read_bytes() == damaged


def test_todo_service_accepts_customer_and_project_links_with_optional_details(tmp_path):
    import uuid

    TodoService = todo_service_type()
    service = TodoService(tmp_path)
    customer_id, project_id = str(uuid.uuid4()), str(uuid.uuid4())
    created = service.create({
        "title": "跟进客户试样",
        "category": "送样",
        "owner": "",
        "customer_id": customer_id,
        "project_id": project_id,
        "related": "",
        "priority": "high",
    })

    reopened = TodoService(tmp_path).list_items()[0]
    assert reopened["id"] == created["id"]
    assert reopened["category"] == "送样"
    assert reopened["owner"] == ""
    assert reopened["customer_id"] == customer_id
    assert reopened["project_id"] == project_id
    assert reopened["related"] == ""


def test_todo_service_reads_legacy_items_with_defaults(tmp_path):
    import json
    import uuid

    TodoService = todo_service_type()
    path = tmp_path / "todos.json"
    item_id = str(uuid.uuid4())
    path.write_text(json.dumps({"version": 1, "items": [{
        "id": item_id, "title": "旧待办", "related": "旧项目", "due_date": None,
        "priority": "normal", "completed": False, "notes": "", "created_at": "2026-10-25T00:00:00+00:00",
        "updated_at": "2026-10-25T00:00:00+00:00",
    }]}), encoding="utf-8")

    item = TodoService(tmp_path).list_items()[0]
    assert item["id"] == item_id
    assert item["category"] == "其他"
    assert item["owner"] == ""
    assert item["customer_id"] is None
    assert item["project_id"] is None
    assert item["status"] == "open"


def test_todo_richer_statuses_and_legacy_complete_toggle_remain_consistent(tmp_path):
    service = todo_service_type()(tmp_path)
    item = service.create({"title": "跟进测试", "status": "in_progress"})
    assert item["status"] == "in_progress" and not item["completed"]
    item = service.update(item["id"], {"status": "waiting"})
    assert item["status"] == "waiting" and not item["completed"]
    item = service.update(item["id"], {"completed": True})
    assert item["status"] == "completed" and item["completed"]
    item = service.update(item["id"], {"completed": False})
    assert item["status"] == "open" and not item["completed"]
    with pytest.raises(ValidationError, match="状态无效"):
        service.update(item["id"], {"status": "invalid"})
