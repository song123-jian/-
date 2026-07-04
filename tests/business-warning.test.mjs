import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBusinessWarnings,
  normalizeBusinessWarningConfig,
  summarizeBusinessWarnings,
} from '../frontend-admin/src/utils/business-warning.ts'

describe('business warnings', () => {
  it('builds stock warnings for low stock, locked quantity, expired and expiring batches', () => {
    const warnings = buildBusinessWarnings({
      config: { today: '2026-07-04', stockExpiryWarningDays: 30 },
      stockRows: [
        {
          id: 1,
          productId: 10,
          productCode: 'P-10',
          productName: '透明件',
          productUnit: '个',
          batchNo: 'B-OLD',
          batchExpiryDate: '2026-07-01',
          qty: 20,
          lockedQty: 25,
          availableQty: -5,
          safeStock: 100,
        },
        {
          id: 2,
          productId: 11,
          productCode: 'P-11',
          productName: '蓝色件',
          productUnit: '个',
          batchNo: 'B-NEW',
          batchExpiryDate: '2026-07-20',
          qty: 80,
          lockedQty: 0,
          availableQty: 80,
          safeStock: 50,
        },
      ],
    })

    assert.ok(warnings.some((item) => item.id === 'stock-locked-1' && item.level === 'ERROR'))
    assert.ok(warnings.some((item) => item.id === 'stock-expired-1' && item.level === 'ERROR'))
    assert.ok(warnings.some((item) => item.id === 'stock-expiring-2' && item.level === 'WARNING'))
    assert.ok(warnings.some((item) => item.id === 'stock-low-10' && item.level === 'ERROR'))
  })

  it('respects stock warning switch while keeping mold warnings active', () => {
    const warnings = buildBusinessWarnings({
      config: { stockWarningEnabled: 'false', today: '2026-07-04' },
      stockRows: [{ productId: 1, productName: 'A', qty: 0, availableQty: 0, safeStock: 10 }],
      moldRows: [{ id: 3, code: 'M-3', name: '三号模', shotsSinceMaintenance: 90, maintenanceCycle: 100 }],
    })

    assert.equal(warnings.some((item) => item.category === '库存'), false)
    assert.ok(warnings.some((item) => item.id === 'mold-maintenance-warning-3'))
  })

  it('builds mold due, lifetime and status warnings', () => {
    const warnings = buildBusinessWarnings({
      config: { moldMaintenanceWarningRatio: 0.8, moldLifetimeWarningRatio: 0.9 },
      moldRows: [
        { id: 1, code: 'M-1', name: '一号模', status: 'NORMAL', shotsSinceMaintenance: 1000, maintenanceCycle: 1000 },
        { id: 2, code: 'M-2', name: '二号模', status: 'REPAIR', usedShots: 9500, lifetime: 10000 },
      ],
    })

    assert.ok(warnings.some((item) => item.id === 'mold-maintenance-due-1' && item.level === 'ERROR'))
    assert.ok(warnings.some((item) => item.id === 'mold-status-2' && item.level === 'WARNING'))
    assert.ok(warnings.some((item) => item.id === 'mold-life-warning-2' && item.level === 'WARNING'))
  })

  it('summarizes warnings by level and category', () => {
    const warnings = buildBusinessWarnings({
      config: { today: '2026-07-04' },
      stockRows: [{ productId: 1, productName: 'A', qty: 0, availableQty: 0, safeStock: 5 }],
      moldRows: [{ id: 1, code: 'M-1', name: '一号模', shotsSinceMaintenance: 100, maintenanceCycle: 100 }],
    })
    const summary = summarizeBusinessWarnings(warnings)

    assert.equal(summary.total, 2)
    assert.equal(summary.error, 2)
    assert.equal(summary.warning, 0)
    assert.equal(summary.stock, 1)
    assert.equal(summary.mold, 1)
  })

  it('normalizes percentage-like warning config values', () => {
    const config = normalizeBusinessWarningConfig({
      stockWarningEnabled: '1',
      stockExpiryWarningDays: '15',
      moldMaintenanceWarningRatio: '80',
      moldLifetimeWarningRatio: '95',
      today: '2026-07-04',
    })

    assert.equal(config.stockWarningEnabled, true)
    assert.equal(config.stockExpiryWarningDays, 15)
    assert.equal(config.moldMaintenanceWarningRatio, 0.8)
    assert.equal(config.moldLifetimeWarningRatio, 0.95)
    assert.equal(config.today, '2026-07-04')
  })
})
