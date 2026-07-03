import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder } from 'node:util'

const root = process.cwd()
const ignoredDirs = new Set(['.git', 'node_modules', 'dist'])
const checkedExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.scss',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.yaml',
  '.yml',
])

const decoder = new TextDecoder('utf-8', { fatal: true })
const failures = []
let checked = 0

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        await walk(absolute)
      }
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!checkedExtensions.has(ext) && entry.name !== '.gitignore' && !entry.name.startsWith('.env')) {
      continue
    }

    checked += 1
    const bytes = await readFile(absolute)
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      failures.push(`${path.relative(root, absolute)}: contains UTF-8 BOM`)
      continue
    }
    try {
      decoder.decode(bytes)
    } catch {
      failures.push(`${path.relative(root, absolute)}: invalid UTF-8`)
    }
  }
}

await walk(root)

if (failures.length) {
  console.error(`Encoding check failed (${failures.length} file(s)):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Encoding check passed (${checked} text file(s), UTF-8 without BOM).`)
