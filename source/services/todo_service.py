"""Account-local, atomic storage for desktop follow-up tasks."""
from __future__ import annotations

import datetime as dt
import json
import threading
import uuid
from pathlib import Path

from domain import ValidationError
from services.price_service import atomic_bytes

MAX_TODO_ITEMS = 2000
MAX_TODO_BYTES = 2 * 1024 * 1024
PRIORITIES = {"low", "normal", "high"}
STATUSES = {"open": "未开始", "in_progress": "进行中", "waiting": "等待反馈", "completed": "已完成"}
CATEGORIES = ("客户跟进", "送样", "测试/认证", "报价", "定点/量产", "交付", "回款", "其他")
FIELDS = {
    "title", "related", "due_date", "priority", "completed", "notes", "category", "owner",
    "customer_id", "customer_name", "project_id", "project_name", "status",
}


class TodoService:
    def __init__(self, folder):
        self.path = Path(folder).resolve() / "todos.json"
        self.lock = threading.RLock()

    def list_items(self):
        with self.lock:
            return self._read()

    def create(self, values):
        with self.lock:
            items = self._read()
            if len(items) >= MAX_TODO_ITEMS:
                raise ValidationError(f"待办事项最多保存 {MAX_TODO_ITEMS} 项")
            item = self._normalize(values)
            now = self._now()
            item.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now})
            items.append(item)
            self._write(items)
            return item

    def update(self, item_id, changes):
        with self.lock:
            items = self._read()
            for index, current in enumerate(items):
                if current["id"] == item_id:
                    merged = {**current, **changes}
                    if "completed" in changes and "status" not in changes:
                        merged["status"] = "completed" if changes["completed"] else "open"
                    updated = self._normalize(merged)
                    updated.update({"id": current["id"], "created_at": current["created_at"],
                                    "updated_at": self._now()})
                    items[index] = updated
                    self._write(items)
                    return updated
            raise ValidationError("待办事项已不存在，请刷新后重试")

    def delete(self, item_id):
        with self.lock:
            items = self._read()
            remaining = [item for item in items if item["id"] != item_id]
            if len(remaining) == len(items):
                return False
            self._write(remaining)
            return True

    @staticmethod
    def _now():
        return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

    @staticmethod
    def _normalize(values):
        if not isinstance(values, dict) or set(values) - FIELDS - {"id", "created_at", "updated_at"}:
            raise ValidationError("待办事项格式无效")
        title = str(values.get("title") or "").strip()
        related = str(values.get("related") or "").strip()
        due_date = str(values.get("due_date") or "").strip()
        priority = str(values.get("priority") or "normal")
        notes = str(values.get("notes") or "").strip()
        category = str(values.get("category") or "其他").strip()
        owner = str(values.get("owner") or "").strip()
        customer_name = str(values.get("customer_name") or "").strip()
        project_name = str(values.get("project_name") or "").strip()
        completed = values.get("completed", False)
        if not title:
            raise ValidationError("请填写待办事项")
        if (len(title) > 240 or len(related) > 240 or len(notes) > 2000 or len(category) > 60
                or len(owner) > 80 or len(customer_name) > 240 or len(project_name) > 240):
            raise ValidationError("待办事项或备注超过允许长度")
        if priority not in PRIORITIES:
            raise ValidationError("待办优先级无效")
        if not isinstance(completed, bool):
            raise ValidationError("待办完成状态无效")
        status = values.get("status", "completed" if completed else "open")
        if not isinstance(status, str) or status not in STATUSES:
            raise ValidationError("待办状态无效")
        completed = status == "completed"
        customer_id = TodoService._optional_uuid(values.get("customer_id"), "客户")
        project_id = TodoService._optional_uuid(values.get("project_id"), "项目")
        if due_date:
            try:
                dt.date.fromisoformat(due_date)
            except ValueError:
                raise ValidationError("截止日期格式应为 YYYY-MM-DD") from None
        return {"title": title, "related": related, "due_date": due_date or None,
                "priority": priority, "completed": completed, "status": status, "notes": notes,
                "category": category, "owner": owner, "customer_id": customer_id,
                "customer_name": customer_name, "project_id": project_id, "project_name": project_name}

    @staticmethod
    def _optional_uuid(value, label):
        if value is None or str(value).strip() == "":
            return None
        try:
            return str(uuid.UUID(str(value)))
        except (ValueError, AttributeError):
            raise ValidationError(f"关联{label}编号无效") from None

    def _read(self):
        if not self.path.exists():
            return []
        if self.path.stat().st_size > MAX_TODO_BYTES:
            raise ValidationError("本地待办文件超过允许大小，原文件已保留")
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            raise ValidationError("本地待办文件损坏，原文件已保留") from None
        if (not isinstance(payload, dict) or payload.get("version") != 1
                or not isinstance(payload.get("items"), list) or len(payload["items"]) > MAX_TODO_ITEMS):
            raise ValidationError("本地待办文件格式无效，原文件已保留")
        items = []
        try:
            for raw in payload["items"]:
                normalized = self._normalize(raw)
                item_id = str(uuid.UUID(str(raw.get("id"))))
                created_at = str(raw["created_at"])
                updated_at = str(raw["updated_at"])
                items.append({**normalized, "id": item_id, "created_at": created_at, "updated_at": updated_at})
        except (AttributeError, KeyError, TypeError, ValueError, ValidationError):
            raise ValidationError("本地待办文件内容无效，原文件已保留") from None
        return items

    def _write(self, items):
        payload = json.dumps({"version": 1, "items": items}, ensure_ascii=False,
                             separators=(",", ":")).encode("utf-8")
        if len(payload) > MAX_TODO_BYTES:
            raise ValidationError("待办数据超过允许大小")
        atomic_bytes(self.path, payload)
