function normalizeUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '')
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split(/[.-]/).map((item) => Number.parseInt(item, 10) || 0)
  const rightParts = normalizeVersion(right).split(/[.-]/).map((item) => Number.parseInt(item, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function releaseAssetDownloadUrl(payload) {
  const assets = Array.isArray(payload?.assets) ? payload.assets : []
  const executableAssets = assets.filter((asset) => /\.exe$/i.test(String(asset?.name || '')))
  const preferredAsset = executableAssets.find((asset) => /portable/i.test(String(asset?.name || '')))
    || executableAssets[0]
  return normalizeUrl(preferredAsset?.browser_download_url)
}

function normalizeUpdateManifest(payload) {
  const latestVersion = normalizeVersion(payload?.version || payload?.latestVersion || payload?.tag_name)
  const downloadUrl = normalizeUrl(payload?.downloadUrl || payload?.download_url)
    || releaseAssetDownloadUrl(payload)
    || normalizeUrl(payload?.html_url)
  return {
    latestVersion,
    downloadUrl,
    releaseDate: String(payload?.releaseDate || payload?.published_at || '').trim(),
    notes: String(payload?.notes || payload?.body || payload?.changelog || '').trim(),
    force: Boolean(payload?.force),
  }
}

module.exports = {
  compareVersions,
  normalizeUpdateManifest,
  normalizeUrl,
}
