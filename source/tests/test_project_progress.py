import json
import sqlite3
import threading
from pathlib import Path

import pytest

from domain import Conflict, ValidationError
from services.project_progress_service import DEFAULT_PROJECT_RULES, score_project, validate_project
from storage.sqlite_store import SQLiteStore
from storage.supabase_store import SupabaseStore


def project(**overrides):
    data = {
        "industry": "汽车零部件",
        "customer_type": "oem",
        "customer_name": "样例测试客户",
        "material": "PP-GF30 改性料",
        "recommended_grade": "JL-30",
        "material_value": "special",
        "custom_material_value": "",
        "color": "黑色",
        "competitor": "",
        "product_name": "内饰支架",
        "stage_code": 5,
        "custom_stage_label": "",
        "customer_value": "geely_strategic",
        "custom_customer_value": "",
        "competition": "awarded",
        "custom_competition": "",
        "next_action": "确认量产计划",
        "milestone_date": "2026-11-15",
        "notes": "受控测试记录",
    }
    data.update(overrides)
    return data


def test_workbook_scoring_model_and_tiers():
    scored = score_project(validate_project(project()))
    assert (scored["stage_score"], scored["customer_score"], scored["competition_score"], scored["material_score"]) == (30, 30, 20, 20)
    assert (scored["total_score"], scored["tier"]) == (100, "A")

    standard = score_project(validate_project(project(
        stage_code=5, customer_value="oem_t1_regular", competition="open", material_value="reinforced")))
    assert (standard["total_score"], standard["tier"]) == (69, "B")

    non_auto = score_project(validate_project(project(
        customer_type="non_auto", customer_value="non_auto", stage_code=1,
        competition="lost", material_value="general")))
    assert (non_auto["total_score"], non_auto["tier"]) == (20, "D")
    assert DEFAULT_PROJECT_RULES["resource_allocation"] == {"A": 50, "B": 30, "C": 20, "D": 0}


def test_custom_project_categories_are_preserved_and_contribute_zero_score():
    checked = validate_project(project(
        custom_stage_label="客户联合试制",
        custom_customer_value="区域重点客户",
        custom_material_value="耐候增强改性",
        custom_competition="新进入者竞争",
    ))
    assert checked["custom_stage_label"] == "客户联合试制"
    assert checked["custom_customer_value"] == "区域重点客户"
    assert checked["custom_material_value"] == "耐候增强改性"
    assert checked["custom_competition"] == "新进入者竞争"
    scored = score_project(checked)
    assert (scored["stage_score"], scored["customer_score"],
            scored["material_score"], scored["competition_score"]) == (0, 0, 0, 0)
    assert (scored["total_score"], scored["tier"]) == (0, "D")

    partial = score_project(validate_project(project(custom_stage_label="客户联合试制")))
    assert partial["stage_score"] == 0
    assert partial["customer_score"] == 30


def test_project_progress_cloud_migration_adds_custom_fields_and_rollback():
    migration_dir = Path(__file__).resolve().parents[1] / "migrations"
    migration_path = migration_dir / "project_progress_v2_custom_values.sql"
    rollback_path = migration_dir / "project_progress_v2_custom_values_rollback.sql"
    assert migration_path.is_file(), "云端自定义字段迁移脚本尚未创建"
    assert rollback_path.is_file(), "云端自定义字段回滚脚本尚未创建"
    migration = migration_path.read_text(encoding="utf-8")
    rollback = rollback_path.read_text(encoding="utf-8")
    for field in ("custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition"):
        assert f"ADD COLUMN IF NOT EXISTS {field}" in migration
        assert f"DROP COLUMN IF EXISTS {field}" in rollback
    assert "CREATE OR REPLACE FUNCTION public.pmu_project_progress_v2" in migration
    assert "CREATE OR REPLACE FUNCTION public.pmu_save_project_progress_v2" in migration
    assert "IF to_regclass('public.pmu_settings') IS NULL" in migration
    assert "WHERE key='project_progress_version' FOR UPDATE" in migration
    assert "current_version IS DISTINCT FROM '1'" in migration
    assert "IF to_regclass('public.pmu_settings') IS NULL" in rollback
    assert "WHERE key='project_progress_version' FOR UPDATE" in rollback
    assert "current_version IS DISTINCT FROM '2'" in rollback


def test_project_validation_rejects_customer_type_mismatch_and_bad_date():
    with pytest.raises(ValidationError, match="客户类型与客户战略价值标签不匹配"):
        validate_project(project(customer_type="non_auto"))
    with pytest.raises(ValidationError, match="时间节点格式"):
        validate_project(project(milestone_date="15/11/2026"))


@pytest.mark.parametrize("field", ["customer_type", "customer_value", "material_value", "stage_code", "competition"])
def test_project_validation_requires_explicit_scoring_categories(field):
    with pytest.raises(ValidationError):
        validate_project(project(**{field: None}))


def test_sqlite_project_progress_persists_with_revision_and_backup(tmp_path):
    store = SQLiteStore(tmp_path, load_seed=False)
    assert store.project_progress_list()["projects"] == []

    created = validate_project(project())
    saved = store.save_project_progress(created)
    assert saved["revision"] == 1
    assert saved["project_id"] == created["project_id"]

    stale = validate_project({**saved, "next_action": "过期编辑"})
    stale["revision"] = 2
    with pytest.raises(Conflict):
        store.save_project_progress(stale)

    updated = validate_project({**saved, "next_action": "确认月度供货计划"})
    result = store.save_project_progress(updated)
    assert result["revision"] == 2
    assert store.project_progress_list()["projects"][0]["next_action"] == "确认月度供货计划"

    backup = store.backup("project-progress")
    with sqlite3.connect(backup) as db:
        row = db.execute("SELECT project_id,revision,next_action FROM project_progress").fetchone()
        rules = db.execute("SELECT value FROM settings WHERE key='project_progress_rules'").fetchone()[0]
    assert row == (created["project_id"], 2, "确认月度供货计划")
    assert json.loads(rules)["version"] == 1


def test_sqlite_adds_custom_value_columns_to_existing_database(tmp_path):
    store = SQLiteStore(tmp_path, load_seed=False)
    original = store.save_project_progress(validate_project(project(next_action="旧版本中已存在的跟进动作")))
    with store.connection() as db:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(project_progress)")}
    custom_fields = ("custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition")
    for field in custom_fields:
        if field in columns:
            with store.connection() as db:
                db.execute(f"ALTER TABLE project_progress DROP COLUMN {field}")

    upgraded = SQLiteStore(tmp_path, load_seed=False)
    with upgraded.connection() as db:
        columns = {row["name"] for row in db.execute("PRAGMA table_info(project_progress)")}
    assert set(custom_fields) <= columns
    preserved = upgraded.project_progress_list()["projects"]
    assert len(preserved) == 1
    assert preserved[0]["project_id"] == original["project_id"]
    assert preserved[0]["customer_name"] == original["customer_name"]
    assert preserved[0]["next_action"] == "旧版本中已存在的跟进动作"
    assert preserved[0]["revision"] == original["revision"]
    assert all(preserved[0][field] == "" for field in custom_fields)

    saved = upgraded.save_project_progress(validate_project(project(custom_stage_label="客户联合试制")))
    assert saved["custom_stage_label"] == "客户联合试制"
    projects_by_id = {item["project_id"]: item for item in upgraded.project_progress_list()["projects"]}
    assert projects_by_id[saved["project_id"]]["custom_stage_label"] == "客户联合试制"


def test_supabase_backup_includes_project_progress_and_normalizes_empty_date(tmp_path, monkeypatch):
    store = SupabaseStore.__new__(SupabaseStore)
    store.folder = tmp_path
    store.lock = threading.RLock()
    store.session = object()
    snapshot = {"quotes": [], "customers": [], "audit": []}
    record = validate_project(project())
    record.update({"revision": 1, "milestone_date": None, "updated_at": "2026-10-24T00:00:00+00:00"})
    monkeypatch.setattr(store, "request", lambda _path, _body: (snapshot, None))
    monkeypatch.setattr(store, "project_progress_list", lambda: {
        "rules": DEFAULT_PROJECT_RULES, "projects": [record]})

    backup = store.backup("project-progress")
    with sqlite3.connect(backup) as db:
        saved = db.execute(
            "SELECT project_id,customer_name,milestone_date,revision FROM project_progress").fetchone()
        rules = db.execute("SELECT value FROM settings WHERE key='project_progress_rules'").fetchone()[0]

    assert saved == (record["project_id"], record["customer_name"], "", 1)
    assert json.loads(rules)["version"] == 1


def test_supabase_project_progress_create_and_update_use_rpc_contract(monkeypatch):
    store = SupabaseStore.__new__(SupabaseStore)
    store.session = object()
    calls = []
    project_id = "8a9aeeea-3598-4db2-a9d5-d36fd130e3a2"

    def request(path, body):
        calls.append((path, body))
        if path == "rpc/pm_project_progress_v2":
            return {"rules": DEFAULT_PROJECT_RULES, "projects": []}, None
        revision = 1 if body["p_project_id"] is None else body["p_expected_revision"] + 1
        return {"project_id": project_id, "revision": revision}, None

    monkeypatch.setattr(store, "request", request)
    assert store.project_progress_list() == {"rules": DEFAULT_PROJECT_RULES, "projects": []}

    record = project()
    created = store.save_project_progress({**record, "_new_project": True})
    updated = store.save_project_progress({
        **record, "_new_project": False, "project_id": project_id, "revision": 1,
    })

    record_fields = (
        "industry", "customer_type", "customer_name", "material", "recommended_grade", "material_value",
        "color", "competitor", "product_name", "stage_code", "customer_value", "competition",
        "custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition",
        "next_action", "milestone_date", "notes",
    )
    expected_record = {key: record[key] for key in record_fields}
    assert created == {"project_id": project_id, "revision": 1}
    assert updated == {"project_id": project_id, "revision": 2}
    assert calls == [
        ("rpc/pm_project_progress_v2", {}),
        ("rpc/pm_save_project_progress_v2", {
            "p_project_id": None, "p_expected_revision": None, "p_record": expected_record,
        }),
        ("rpc/pm_save_project_progress_v2", {
            "p_project_id": project_id, "p_expected_revision": 1, "p_record": expected_record,
        }),
    ]


def test_project_progress_template_round_trip_preserves_revision():
    from services import project_progress_service as progress

    assert callable(getattr(progress, "project_progress_template_bytes", None)), "项目进度模板资源未提供"
    assert callable(getattr(progress, "export_project_progress_xlsx", None)), "项目进度 XLSX 导出未提供"
    assert callable(getattr(progress, "parse_project_progress_workbook", None)), "项目进度 XLSX 导入未提供"

    row = validate_project({
        **project(), "project_id": "8a9aeeea-3598-4db2-a9d5-d36fd130e3a2", "revision": 3,
        "custom_stage_label": "客户联合试制", "custom_customer_value": "区域重点客户",
        "custom_material_value": "耐候增强改性", "custom_competition": "新进入者竞争",
    })
    exported = progress.export_project_progress_xlsx([score_project(row)])
    parsed = progress.parse_project_progress_workbook(exported)

    assert parsed["errors"] == []
    assert len(parsed["projects"]) == 1
    assert parsed["projects"][0]["project_id"] == row["project_id"]
    assert parsed["projects"][0]["revision"] == 3
    assert parsed["projects"][0]["material"] == row["material"]
    assert parsed["projects"][0]["customer_type"] == row["customer_type"]
    for field in ("custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition"):
        assert parsed["projects"][0][field] == row[field]


def test_project_progress_template_has_no_records_and_requires_scoring_columns():
    from services import project_progress_service as progress

    assert callable(getattr(progress, "project_progress_template_bytes", None)), "项目进度模板资源未提供"
    assert callable(getattr(progress, "parse_project_progress_workbook", None)), "项目进度 XLSX 导入未提供"
    template = progress.project_progress_template_bytes()
    parsed = progress.parse_project_progress_workbook(template)
    assert parsed["projects"] == []
    assert parsed["errors"] == []

    from io import BytesIO
    from xml.etree import ElementTree as ET
    from zipfile import ZipFile

    with ZipFile(BytesIO(template)) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    namespace = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    sheet_names = [sheet.get("name") for sheet in workbook.findall(f"{namespace}sheets/{namespace}sheet")]
    assert sheet_names == ["项目进度表", "评分模型", "最优方案"]

    from test_core_import import xlsx_bytes

    original_headers = ["行业", "客户名称", "材料", "推荐牌号", "材料价值", "颜色", "竞争对手", "产品名称",
                        "项目进度(阶段代码)", "项目阶段(自动)", "下一步动作(建议)", "时间节点", "备注"]
    missing_categories = progress.parse_project_progress_workbook(xlsx_bytes([
        original_headers,
        ["汽车零部件", "QA客户", "PP-GF30", "QA-30", "常规增强改性", "黑色", "", "支架", "2", "送样 / 试料", "送样", "", ""],
    ]))
    assert not missing_categories["projects"]
    assert any("客户类型" in error["message"] for error in missing_categories["errors"])
