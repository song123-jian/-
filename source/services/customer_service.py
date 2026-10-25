"""Exact, reversible customer deletion with revision checks and request recovery."""
from __future__ import annotations

import re
import threading

from domain import NetworkError, ValidationError, clean


class CustomerService:
    def __init__(self, context):
        self.context = context
        self._summary_cache = {}
        self._summary_cache_lock = threading.RLock()

    @staticmethod
    def checked_key(key):
        if not isinstance(key, str) or not re.fullmatch(r"[a-f0-9]{64}", key):
            raise ValidationError("请选择具体客户，不能删除全部客户或搜索匹配结果")
        return key

    def list_customers(self, status, generation):
        if status not in ("active", "deleted"):
            raise ValidationError("客户状态无效")
        # Capture the store and data generation together so a cached directory
        # can never cross a backend switch or a successful customer/quote write.
        with self.context.state_lock:
            self.context.assert_generation(generation)
            store, captured = self.context.store, self.context.storage_generation
            data_generation = self.context.data_generation
        cache_key = (captured, data_generation, status)
        with self._summary_cache_lock:
            self._summary_cache = {
                key: value for key, value in self._summary_cache.items()
                if key[:2] == cache_key[:2]
            }
            cached = self._summary_cache.get(cache_key)
        if cached is not None:
            return {"items": [dict(row) for row in cached], "storage_generation": captured}
        items = sorted(store.customer_summaries(status), key=lambda r: r["display_name"])
        with self._summary_cache_lock:
            # A concurrent write may have made this read obsolete while the
            # store query was running; obsolete results remain uncached.
            if (captured == self.context.storage_generation
                    and data_generation == self.context.data_generation):
                self._summary_cache[cache_key] = tuple(dict(row) for row in items)
        return {"items": [dict(row) for row in items], "storage_generation": captured}

    def invalidate_cache(self):
        with self._summary_cache_lock:
            self._summary_cache.clear()

    def preview_delete(self, key, generation):
        store, captured = self.context.capture(generation)
        result = store.customer_details(self.checked_key(key))
        return {**result, "backend": store.backend, "storage_generation": captured}

    def delete_customer(self, key, expected_revision, generation, request_id, reason=""):
        return self._change(key, "delete", expected_revision, generation, request_id, reason)

    def restore_customer(self, key, expected_revision, generation, request_id):
        return self._change(key, "restore", expected_revision, generation, request_id, "")

    def _change(self, key, action, expected_revision, generation, request_id, reason):
        key = self.checked_key(key)
        if isinstance(expected_revision, bool) or not isinstance(expected_revision, int) or expected_revision < 0:
            raise ValidationError("客户版本无效，请重新预览")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{16,100}", request_id):
            raise ValidationError("客户请求编号无效，请重新预览")
        reason = clean(reason, 1000)
        with self.context.operation_lock:
            store, captured = self.context.capture(generation)
            prior = store.customer_request(request_id)
            backup = None if prior else store.backup("before-customer-" + action)
            try:
                result = store.change_customer(key, action, expected_revision, request_id, reason)
            except NetworkError:
                # A response can be lost after commit. Read the audit once; never
                # blindly replay an uncertain write or create a new request ID.
                try:
                    result = store.customer_request(request_id)
                except NetworkError:
                    result = None
                if not result:
                    raise NetworkError("客户操作结果未确认，请保持本窗口并点击“核对结果”；不要再次创建删除请求") from None
            self.context.invalidate_customer_data()
            self.invalidate_cache()
            return {**result, "backup": str(backup) if backup else None, "storage_generation": captured,
                    "message": "客户已移入回收站，全部报价历史保留" if action == "delete" else "客户已恢复，当前价按今日重新计算"}

    def recover_request(self, request_id, generation):
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{16,100}", request_id):
            raise ValidationError("客户请求编号无效")
        with self.context.operation_lock:
            store, captured = self.context.capture(generation)
            result = store.customer_request(request_id)
            if not result:
                raise ValidationError("尚无已提交的客户操作记录，请刷新客户状态并重新预览")
            self.context.invalidate_customer_data()
            self.invalidate_cache()
            return {**result, "storage_generation": captured, "message": "已核对客户操作结果"}
