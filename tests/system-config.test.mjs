import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_SYSTEM_CONFIG,
  SYSTEM_CONFIG_KEYS,
  buildSystemConfigPayload,
  buildSystemConfigRows,
  normalizeSystemConfig,
  toSystemConfigBoolean,
  validateSystemConfig,
} from '../frontend-admin/src/utils/system-config.ts'

describe('system config normalization', () => {
  it('normalizes database strings into a stable page model', () => {
    const config = normalizeSystemConfig({
      factory_name: '  华东注塑厂  ',
      system_title: '  业财库生一体化平台  ',
      shift_day_start: '8:5',
      shift_night_start: '20:0',
      overtime_threshold_min: '481.8',
      bad_rate_warning: '4.567',
      delivery_warning_days: '7',
      stock_expiry_warning_days: '15',
      piece_price_tolerance: '2.5',
      stock_warning_enabled: 'false',
      fifo_enabled: 'yes',
      inventory_freeze_on_count: '0',
      location_capacity_check: 'enabled',
      auto_daily_settle: 'off',
      auto_backup: 'true',
      backup_time: '2:3',
      backup_keep_days: '60',
      external_push_enabled: '1',
      wecom_webhook_url: ' https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=1 ',
      dingtalk_webhook_url: '',
      mold_maintenance_warning_ratio: '0.8',
      mold_lifetime_warning_ratio: '95',
      unknown_key: 'ignored',
    })

    assert.deepEqual(config, {
      ...DEFAULT_SYSTEM_CONFIG,
      factory_name: '华东注塑厂',
      system_title: '业财库生一体化平台',
      shift_day_start: '08:05',
      shift_night_start: '20:00',
      overtime_threshold_min: 481,
      bad_rate_warning: 4.57,
      delivery_warning_days: 7,
      stock_expiry_warning_days: 15,
      piece_price_tolerance: 2.5,
      stock_warning_enabled: false,
      fifo_enabled: true,
      inventory_freeze_on_count: false,
      location_capacity_check: true,
      auto_daily_settle: false,
      auto_backup: true,
      backup_time: '02:03',
      backup_keep_days: 60,
      external_push_enabled: true,
      wecom_webhook_url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=1',
      dingtalk_webhook_url: '',
      mold_maintenance_warning_ratio: 80,
      mold_lifetime_warning_ratio: 95,
    })
  })

  it('keeps boolean parsing explicit and fallback based', () => {
    assert.equal(toSystemConfigBoolean('false', true), false)
    assert.equal(toSystemConfigBoolean('enabled', false), true)
    assert.equal(toSystemConfigBoolean('unknown', true), true)
  })
})

describe('system config validation', () => {
  it('accepts a complete enterprise-safe configuration', () => {
    assert.equal(validateSystemConfig({
      ...DEFAULT_SYSTEM_CONFIG,
      wecom_webhook_url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=1',
    }), '')
  })

  it('rejects required text, time, numeric and warehouse boundaries', () => {
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, factory_name: '' }), '请输入工厂名称')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, system_title: 'A'.repeat(81) }), '系统标题不能超过 80 个字符')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, default_raw_warehouse: '0' }), '默认原料仓必须是有效的正整数编号')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, shift_day_start: '24:00' }), '白班开始时间必须为 HH:mm')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, shift_day_start: '08:00', shift_night_start: '08:00' }), '白班和夜班开始时间不能相同')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, overtime_threshold_min: 1441 }), '日工时加班阈值必须在 1-1440 分钟之间')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, stock_expiry_warning_days: 0 }), '批次临期预警天数必须在 1-365 天之间')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, mold_maintenance_warning_ratio: -1 }), '模具保养预警比例必须在 1-100% 之间')
  })

  it('rejects unsafe webhook combinations', () => {
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, external_push_enabled: true, wecom_webhook_url: '', dingtalk_webhook_url: '' }), '启用外部推送时至少填写一个 Webhook')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, wecom_webhook_url: 'http://example.com' }), '企业微信 Webhook 必须是 500 字符以内的 HTTPS 地址')
    assert.equal(validateSystemConfig({ ...DEFAULT_SYSTEM_CONFIG, dingtalk_webhook_url: `https://${'a'.repeat(500)}.com` }), '钉钉 Webhook 必须是 500 字符以内的 HTTPS 地址')
  })
})

describe('system config persistence payload', () => {
  it('builds a string-only whitelist payload for sys_config', () => {
    const payload = buildSystemConfigPayload({
      ...DEFAULT_SYSTEM_CONFIG,
      stock_warning_enabled: false,
      mold_maintenance_warning_ratio: 0.8,
      dingtalk_webhook_url: ' https://oapi.dingtalk.com/robot/send?access_token=1 ',
      injected: 'ignored',
    })

    assert.deepEqual(Object.keys(payload), [...SYSTEM_CONFIG_KEYS])
    assert.equal(payload.stock_warning_enabled, 'false')
    assert.equal(payload.mold_maintenance_warning_ratio, '80')
    assert.equal(payload.dingtalk_webhook_url, 'https://oapi.dingtalk.com/robot/send?access_token=1')
    assert.equal(Object.hasOwn(payload, 'injected'), false)
  })

  it('builds deterministic upsert rows with one row per managed key', () => {
    const rows = buildSystemConfigRows(DEFAULT_SYSTEM_CONFIG, '2026-07-04T00:00:00.000Z')
    assert.equal(rows.length, SYSTEM_CONFIG_KEYS.length)
    assert.deepEqual(rows[0], {
      config_key: 'factory_name',
      config_value: DEFAULT_SYSTEM_CONFIG.factory_name,
      updated_at: '2026-07-04T00:00:00.000Z',
    })
    assert.equal(rows.at(-1).config_key, 'mold_lifetime_warning_ratio')
  })
})
