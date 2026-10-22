"""Assemble an atomic, empty-project-only registration bootstrap and rehearsal."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

SOURCES = (
    'supabase.sql',
    'migrations/quote_workflow_v160.sql',
    'migrations/read_optimization_v165.sql',
    'migrations/multiuser_v170.sql',
    'migrations/multiuser_auth_bridge_v170.sql',
    'migrations/self_registration_v171.sql',
    'migrations/registration_account_limit_v173.sql',
)
GUARD = """BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND (left(c.relname,3)='pm_' OR left(c.relname,4)='pmu_'))
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND (left(p.proname,3)='pm_' OR left(p.proname,4)='pmu_'))
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='pmu_executor') THEN
    RAISE EXCEPTION '只允许初始化全新项目；检测到现有程序结构，未覆盖';
  END IF;
END $$;
"""


def body(text):
    return re.sub(r'(?im)^\s*(?:BEGIN|COMMIT|ROLLBACK);[ \t]*\r?$', '', text)


def build(output):
    root = Path(__file__).resolve().parent
    output.mkdir(parents=True, exist_ok=True)
    paths = [output / name for name in ('初始化注册后台.sql', '初始化回滚演练.sql', 'backend-sources.json')]
    if any(path.exists() for path in paths):
        raise FileExistsError('Backend output already exists; use a new output directory.')
    sections = []
    manifest = {}
    for name in SOURCES:
        raw = (root / name).read_bytes()
        manifest[name] = hashlib.sha256(raw).hexdigest().upper()
        sections.append('-- Source: ' + name + '\n' + body(raw.decode('utf-8-sig')))
    combined = GUARD + '\n'.join(sections)
    paths[0].write_text(combined + '\nCOMMIT;\n', encoding='utf-8')
    verification = body((root / 'migrations/registration_limits_verify.sql').read_text(encoding='utf-8'))
    paths[1].write_text(combined + '\n' + verification + '\nROLLBACK;\n', encoding='utf-8')
    paths[2].write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('BACKEND_PACKAGE=' + str(output.resolve()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    build(parser.parse_args().output)
