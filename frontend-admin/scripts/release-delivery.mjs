import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  access,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectDirectory = path.resolve(scriptDirectory, '..')
const repositoryDirectory = path.resolve(projectDirectory, '..')
const releaseDirectory = path.join(projectDirectory, 'release')
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const temporaryEntryNames = new Set([
  'builder-debug.yml',
  'builder-effective-config.yaml',
  'win-unpacked',
])

export function createReleaseArtifactNames(version) {
  const normalizedVersion = String(version || '').trim()
  if (!versionPattern.test(normalizedVersion)) {
    throw new Error(`版本号格式无效：${normalizedVersion || '空值'}`)
  }
  return {
    portableExe: `InjectERP-Admin-${normalizedVersion}-portable.exe`,
    fastDirectory: `InjectERP-Admin-${normalizedVersion}-fast`,
    manifest: 'release-manifest.json',
    checksums: 'SHA256SUMS.txt',
  }
}

function sortNames(names) {
  return [...names].sort((left, right) => left.localeCompare(right, 'en'))
}

export function analyzeReleaseInventory(version, entries, required = ['portable', 'fast']) {
  const names = createReleaseArtifactNames(version)
  const available = new Set(Array.isArray(entries) ? entries : [])
  const requiredNames = []
  if (required.includes('portable')) requiredNames.push(names.portableExe)
  if (required.includes('fast')) requiredNames.push(names.fastDirectory)

  const expectedVersioned = new Set([names.portableExe, names.fastDirectory])
  const stale = [...available].filter((name) => (
    name.startsWith('InjectERP-Admin-') && !expectedVersioned.has(name)
  ))
  const temporary = [...available].filter((name) => temporaryEntryNames.has(name))

  return {
    missing: requiredNames.filter((name) => !available.has(name)),
    stale: sortNames(stale),
    temporary: sortNames(temporary),
  }
}

function assertGeneratedPath(baseDirectory, candidatePath) {
  const relative = path.relative(baseDirectory, candidatePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`构建产物路径越界：${candidatePath}`)
  }
}

async function readPackageVersion() {
  const adminPackage = JSON.parse(await readFile(path.join(projectDirectory, 'package.json'), 'utf8'))
  const rootPackage = JSON.parse(await readFile(path.join(repositoryDirectory, 'package.json'), 'utf8'))
  if (adminPackage.version !== rootPackage.version) {
    throw new Error(`版本不一致：根项目 ${rootPackage.version}，桌面端 ${adminPackage.version}`)
  }
  createReleaseArtifactNames(adminPackage.version)
  return adminPackage.version
}

async function requireFile(filePath, label) {
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    throw new Error(`缺少${label}：${filePath}`)
  }
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error(`${label}不是有效文件：${filePath}`)
  }
  return fileStat
}

export async function sha256File(filePath) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex').toUpperCase()
}

async function removeTemporaryEntries() {
  for (const name of temporaryEntryNames) {
    const candidate = path.join(releaseDirectory, name)
    assertGeneratedPath(releaseDirectory, candidate)
    await rm(candidate, { recursive: true, force: true })
  }
}

async function finalizeFastPackage() {
  const version = await readPackageVersion()
  const names = createReleaseArtifactNames(version)
  const source = path.join(releaseDirectory, 'win-unpacked')
  const target = path.join(releaseDirectory, names.fastDirectory)
  assertGeneratedPath(releaseDirectory, source)
  assertGeneratedPath(releaseDirectory, target)

  await access(source)
  await requireFile(path.join(source, '注塑ERP管理端.exe'), '极速版启动程序')
  await requireFile(path.join(source, 'resources', 'app.asar'), '极速版应用包')
  await rm(target, { recursive: true, force: true })
  await rename(source, target)
  await removeTemporaryEntries()
  process.stdout.write(`Fast no-install package ready: ${target}\n`)
}

function parseRequired(args) {
  const raw = args.find((value) => value.startsWith('--require='))?.slice('--require='.length)
  const required = raw ? raw.split(',').map((value) => value.trim()).filter(Boolean) : ['portable', 'fast']
  const unsupported = required.filter((value) => !['portable', 'fast'].includes(value))
  if (unsupported.length > 0) throw new Error(`不支持的交付类型：${unsupported.join(', ')}`)
  return [...new Set(required)]
}

async function buildArtifactRecord(filePath, relativeName) {
  const fileStat = await requireFile(filePath, '交付文件')
  return {
    name: relativeName.replaceAll('\\', '/'),
    sizeBytes: fileStat.size,
    sha256: await sha256File(filePath),
  }
}

async function verifyRelease(args) {
  const version = await readPackageVersion()
  const names = createReleaseArtifactNames(version)
  const required = parseRequired(args)
  const entries = await readdir(releaseDirectory)
  const inventory = analyzeReleaseInventory(version, entries, required)
  if (inventory.missing.length || inventory.stale.length || inventory.temporary.length) {
    const details = [
      inventory.missing.length ? `缺少：${inventory.missing.join(', ')}` : '',
      inventory.stale.length ? `旧版本：${inventory.stale.join(', ')}` : '',
      inventory.temporary.length ? `临时产物：${inventory.temporary.join(', ')}` : '',
    ].filter(Boolean).join('；')
    throw new Error(`交付目录校验失败：${details}`)
  }

  const artifacts = []
  const portablePath = path.join(releaseDirectory, names.portableExe)
  if (entries.includes(names.portableExe)) {
    artifacts.push(await buildArtifactRecord(portablePath, names.portableExe))
  }

  const fastDirectoryPath = path.join(releaseDirectory, names.fastDirectory)
  if (entries.includes(names.fastDirectory)) {
    const fastExeName = path.join(names.fastDirectory, '注塑ERP管理端.exe')
    const appAsarName = path.join(names.fastDirectory, 'resources', 'app.asar')
    artifacts.push(await buildArtifactRecord(path.join(releaseDirectory, fastExeName), fastExeName))
    artifacts.push(await buildArtifactRecord(path.join(releaseDirectory, appAsarName), appAsarName))
  }

  const generatedAt = new Date().toISOString()
  const manifest = { version, generatedAt, artifacts }
  await writeFile(
    path.join(releaseDirectory, names.manifest),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    path.join(releaseDirectory, names.checksums),
    `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.name}`).join('\n')}\n`,
    'utf8',
  )
  process.stdout.write(`Release verified: ${version}, ${artifacts.length} checked file(s)\n`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'finalize-fast') {
    await finalizeFastPackage()
    return
  }
  if (command === 'verify') {
    await verifyRelease(args)
    return
  }
  throw new Error('用法：release-delivery.mjs <finalize-fast|verify> [--require=portable,fast]')
}

const executedDirectly = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (executedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error?.message || error}\n`)
    process.exitCode = 1
  })
}
