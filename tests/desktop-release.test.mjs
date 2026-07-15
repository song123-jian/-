import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'

const adminPackage = JSON.parse(await readFile(new URL('../frontend-admin/package.json', import.meta.url), 'utf8'))

describe('desktop release delivery', () => {
  it('uses deterministic names for portable and fast no-install artifacts', async () => {
    const { createReleaseArtifactNames } = await import('../frontend-admin/scripts/release-delivery.mjs')

    assert.deepEqual(createReleaseArtifactNames('1.2.3'), {
      portableExe: 'InjectERP-Admin-1.2.3-portable.exe',
      fastDirectory: 'InjectERP-Admin-1.2.3-fast',
      manifest: 'release-manifest.json',
      checksums: 'SHA256SUMS.txt',
    })
    assert.throws(() => createReleaseArtifactNames('../unsafe'), /版本号格式无效/)
  })

  it('detects missing, stale and temporary release outputs', async () => {
    const { analyzeReleaseInventory } = await import('../frontend-admin/scripts/release-delivery.mjs')
    const validEntries = [
      'InjectERP-Admin-1.0.2-portable.exe',
      'InjectERP-Admin-1.0.2-fast',
      'release-manifest.json',
      'SHA256SUMS.txt',
    ]

    assert.deepEqual(analyzeReleaseInventory('1.0.2', validEntries, ['portable', 'fast']), {
      missing: [],
      stale: [],
      temporary: [],
    })
    assert.deepEqual(analyzeReleaseInventory('1.0.2', [
      'InjectERP-Admin-1.0.1-portable.exe',
      'win-unpacked',
      'builder-debug.yml',
    ], ['portable', 'fast']), {
      missing: [
        'InjectERP-Admin-1.0.2-portable.exe',
        'InjectERP-Admin-1.0.2-fast',
      ],
      stale: ['InjectERP-Admin-1.0.1-portable.exe'],
      temporary: ['builder-debug.yml', 'win-unpacked'],
    })
  })

  it('exposes fast packaging and release verification commands', () => {
    assert.match(adminPackage.scripts['desktop:fast'], /release-delivery\.mjs finalize-fast/)
    assert.match(adminPackage.scripts['verify:release'], /release-delivery\.mjs verify/)
  })
})
