#!/usr/bin/env node

const { execFileSync, spawn } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')

const { createReleaseHttpClient } = require('./http')

// npm package name — used for registry version checks (auto-update).
// Distinct from binaryName below: the npm package is scoped (@openbuff/cli)
// but the compiled binary and command users type is still `openbuff`.
const npmPackageName = '@openbuff/cli'
const binaryName = 'openbuff'
const MIN_LEGACY_MACOS_MAJOR = 11
const MIN_SUPPORTED_MACOS_MAJOR = 13
const OLD_BINARY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const OLD_BINARY_MAX_COUNT = 2
const TREE_SITTER_MANIFEST = 'tree-sitter-manifest.json'
const REQUIRED_TREE_SITTER_ASSETS = [
  'tree-sitter.wasm',
  'tree-sitter-c-sharp.wasm',
  'tree-sitter-cpp.wasm',
  'tree-sitter-go.wasm',
  'tree-sitter-java.wasm',
  'tree-sitter-javascript.wasm',
  'tree-sitter-python.wasm',
  'tree-sitter-ruby.wasm',
  'tree-sitter-rust.wasm',
  'tree-sitter-typescript.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-kotlin.wasm',
  'tree-sitter-php.wasm',
  'tree-sitter-swift.wasm',
  'tree-sitter-gdscript.wasm',
]

function resolveConfigDir(env, platform, homeDir) {
  if (env.OPENBUFF_CONFIG_DIR) return env.OPENBUFF_CONFIG_DIR
  if (platform === 'win32' && env.APPDATA) {
    return path.join(env.APPDATA, 'openbuff')
  }
  if (env.XDG_CONFIG_HOME) {
    return path.join(env.XDG_CONFIG_HOME, 'openbuff')
  }
  return path.join(homeDir, '.config', 'openbuff')
}

function getManagedSiblingNames(tempDir) {
  const extracted = fs.existsSync(tempDir) ? fs.readdirSync(tempDir) : []
  const wasmSiblings = extracted.filter(
    (name) =>
      name === 'tree-sitter.wasm' ||
      /^tree-sitter-[a-z0-9-]+\.wasm$/i.test(name),
  )
  return [
    ...new Set([
      ...wasmSiblings,
      ...(extracted.includes(TREE_SITTER_MANIFEST)
        ? [TREE_SITTER_MANIFEST]
        : []),
      'libopentui.dylib',
      'rg',
    ]),
  ]
}

function getTreeSitterAssetProblems(dir) {
  const manifestPath = path.join(dir, TREE_SITTER_MANIFEST)
  if (!fs.existsSync(manifestPath)) return [TREE_SITTER_MANIFEST]
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return [`${TREE_SITTER_MANIFEST}:invalid`]
  }
  if (
    manifest?.schemaVersion !== 1 ||
    !manifest.files ||
    typeof manifest.files !== 'object'
  ) {
    return [`${TREE_SITTER_MANIFEST}:invalid`]
  }
  const problems = []
  for (const required of REQUIRED_TREE_SITTER_ASSETS) {
    if (!(required in manifest.files)) problems.push(`${required}:unlisted`)
  }
  for (const [name, expectedHash] of Object.entries(manifest.files)) {
    if (!/^tree-sitter(?:-[a-z0-9-]+)?\.wasm$/i.test(name)) {
      problems.push(`${name}:invalid-name`)
      continue
    }
    const filePath = path.join(dir, name)
    if (!fs.existsSync(filePath)) {
      problems.push(name)
      continue
    }
    const actualHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(filePath))
      .digest('hex')
    if (actualHash !== expectedHash) problems.push(`${name}:checksum`)
  }
  return problems
}

function cleanupOldBinaryBackups(binaryPath, now = Date.now()) {
  const dir = path.dirname(binaryPath)
  const prefix = `${path.basename(binaryPath)}.old.`
  if (!fs.existsSync(dir)) return []
  const backups = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({
      name,
      timestamp: Number(name.slice(prefix.length)),
    }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
  const removed = []
  for (const [index, backup] of backups.entries()) {
    if (
      index < OLD_BINARY_MAX_COUNT &&
      now - backup.timestamp <= OLD_BINARY_MAX_AGE_MS
    ) {
      continue
    }
    const backupPath = path.join(dir, backup.name)
    try {
      fs.unlinkSync(backupPath)
      removed.push(backupPath)
    } catch {
      // Locked backups are retried on the next launch.
    }
  }
  return removed
}

/**
 * Terminal escape sequences to reset terminal state after the child process exits.
 * When the binary is SIGKILL'd, it can't clean up its own terminal state.
 * The wrapper (this process) survives and must reset these modes.
 *
 * Keep in sync with TERMINAL_RESET_SEQUENCES in cli/src/utils/renderer-cleanup.ts
 */
const TERMINAL_RESET_SEQUENCES =
  '\x1b[?1049l' + // Exit alternate screen buffer
  '\x1b[?1000l' + // Disable X10 mouse mode
  '\x1b[?1002l' + // Disable button event mouse mode
  '\x1b[?1003l' + // Disable any-event mouse mode (all motion)
  '\x1b[?1006l' + // Disable SGR extended mouse mode
  '\x1b[?1004l' + // Disable focus reporting
  '\x1b[?2004l' + // Disable bracketed paste mode
  '\x1b[?25h' // Show cursor

function resetTerminal() {
  try {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }
  } catch {
    // stdin may be closed
  }
  try {
    if (process.stdout.isTTY) {
      process.stdout.write(TERMINAL_RESET_SEQUENCES)
    }
  } catch {
    // stdout may be closed
  }
}

function createConfig(binName) {
  const homeDir = os.homedir()
  const configDir = resolveConfigDir(process.env, process.platform, homeDir)
  const resolvedBinaryName =
    process.platform === 'win32' ? `${binName}.exe` : binName

  return {
    homeDir,
    configDir,
    binaryName: resolvedBinaryName,
    binaryPath: path.join(configDir, resolvedBinaryName),
    metadataPath: path.join(configDir, 'openbuff-metadata.json'),
    tempDownloadDir: path.join(configDir, '.download-temp'),
    userAgent: `${binName}-cli`,
    requestTimeout: 20000,
  }
}

const CONFIG = createConfig(binaryName)
const { getProxyUrl, httpGet } = createReleaseHttpClient({
  env: process.env,
  userAgent: CONFIG.userAgent,
  requestTimeout: CONFIG.requestTimeout,
})

function getPostHogConfig() {
  const apiKey =
    process.env.CODEBUFF_POSTHOG_API_KEY ||
    process.env.NEXT_PUBLIC_POSTHOG_API_KEY
  const host =
    process.env.CODEBUFF_POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST_URL

  if (!apiKey || !host) {
    return null
  }

  return { apiKey, host }
}

/**
 * Track update failure event to PostHog.
 * Fire-and-forget - errors are silently ignored.
 */
function trackUpdateFailed(errorMessage, version, context = {}) {
  try {
    const posthogConfig = getPostHogConfig()
    if (!posthogConfig) {
      return
    }

    const payload = JSON.stringify({
      api_key: posthogConfig.apiKey,
      event: 'cli.update_openbuff_failed',
      properties: {
        distinct_id: `anonymous-${CONFIG.homeDir}`,
        error: errorMessage,
        version: version || 'unknown',
        platform: process.platform,
        arch: process.arch,
        ...context,
      },
      timestamp: new Date().toISOString(),
    })

    const parsedUrl = new URL(`${posthogConfig.host}/capture/`)
    const isHttps = parsedUrl.protocol === 'https:'
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }

    const transport = isHttps ? https : http
    const req = transport.request(options)
    req.on('error', () => {}) // Silently ignore errors
    req.write(payload)
    req.end()
  } catch (e) {
    // Silently ignore any tracking errors
  }
}

// Binary tarball asset filenames on the GitHub Release. The binary is named
// `openbuff` (see binaryName above) regardless of the scoped npm package name.
const PLATFORM_TARGETS = {
  'linux-x64': `${binaryName}-linux-x64.tar.gz`,
  'linux-arm64': `${binaryName}-linux-arm64.tar.gz`,
  'darwin-x64': `${binaryName}-darwin-x64.tar.gz`,
  'darwin-x64-legacy': `${binaryName}-darwin-x64-legacy.tar.gz`,
  'darwin-arm64-legacy': `${binaryName}-darwin-arm64-legacy.tar.gz`,
  'darwin-arm64': `${binaryName}-darwin-arm64.tar.gz`,
  'win32-x64': `${binaryName}-win32-x64.tar.gz`,
}

function normalizeHardwareArch(arch) {
  if (arch === 'x86_64') return 'x64'
  if (arch === 'aarch64') return 'arm64'
  return arch
}

function getHardwareArch() {
  if (process.env.OPENBUFF_TEST_HARDWARE_ARCH) {
    return normalizeHardwareArch(process.env.OPENBUFF_TEST_HARDWARE_ARCH)
  }

  if (process.platform !== 'darwin') {
    return normalizeHardwareArch(process.arch)
  }

  try {
    return normalizeHardwareArch(
      execFileSync('uname', ['-m'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || process.arch,
    )
  } catch {
    return normalizeHardwareArch(process.arch)
  }
}

function getMacOSVersion() {
  if (process.env.OPENBUFF_TEST_MACOS_VERSION) {
    return process.env.OPENBUFF_TEST_MACOS_VERSION
  }
  if (process.platform !== 'darwin') return null
  try {
    return execFileSync('sw_vers', ['-productVersion'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function parseLinuxCpuInfo(cpuInfo) {
  if (typeof cpuInfo !== 'string') {
    return { model: null, avx2: null }
  }

  const model = cpuInfo.match(/^model name\s*:\s*(.+)$/im)?.[1]?.trim() ?? null
  const flagsText = cpuInfo.match(/^flags\s*:\s*(.+)$/im)?.[1]
  if (!flagsText) {
    return { model, avx2: null }
  }

  const flags = new Set(flagsText.toLowerCase().split(/\s+/).filter(Boolean))
  return { model, avx2: flags.has('avx2') }
}

function getCpuCompatibilityInfo(platformKey = getPlatformKey()) {
  const fallbackModel = os.cpus()?.[0]?.model?.trim() || null
  const avx2Applicable = platformKey.split('-').includes('x64')
  if (!avx2Applicable) {
    return { model: fallbackModel, avx2: null, avx2Applicable: false }
  }
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    return { model: fallbackModel, avx2: null, avx2Applicable: true }
  }

  try {
    const cpuInfo =
      process.env.OPENBUFF_TEST_CPU_INFO !== undefined
        ? process.env.OPENBUFF_TEST_CPU_INFO
        : fs.readFileSync('/proc/cpuinfo', 'utf8')
    const parsed = parseLinuxCpuInfo(cpuInfo)
    return {
      model: parsed.model ?? fallbackModel,
      avx2: parsed.avx2,
      avx2Applicable: true,
    }
  } catch {
    return { model: fallbackModel, avx2: null, avx2Applicable: true }
  }
}

function getIllegalInstructionGuidance({ avx2, avx2Applicable = true }) {
  const lines = [
    'The binary attempted to execute an instruction that the CPU or runtime rejected.',
  ]

  if (!avx2Applicable) {
    lines.push(
      'The selected release is not an x64 build, so AVX2 does not apply.',
      'This may indicate a binary, native dependency, virtualization, or runtime compatibility defect.',
    )
  } else if (avx2 === true) {
    lines.push(
      'This CPU reports AVX2 support, so a missing AVX2 instruction set is not the likely cause.',
      'This may indicate a binary, native dependency, virtualization, or runtime compatibility defect.',
    )
  } else if (avx2 === false) {
    lines.push(
      'This CPU does not report AVX2 support, so CPU instruction compatibility may be the cause.',
      'The crash may also come from a native dependency or runtime compatibility defect.',
    )
  } else {
    lines.push(
      'Openbuff could not determine whether this CPU supports AVX2.',
      'This may indicate an unsupported CPU instruction or a binary, native dependency, virtualization, or runtime defect.',
    )
  }

  return lines
}

function assertSupportedPlatform() {
  if (process.platform !== 'darwin') return
  const version = getMacOSVersion()
  const major = Number.parseInt(version?.split('.')[0] ?? '', 10)
  if (!Number.isFinite(major) || major >= MIN_SUPPORTED_MACOS_MAJOR) return
  if (major < MIN_LEGACY_MACOS_MAJOR) {
    console.error(
      `❌ Openbuff requires macOS ${MIN_LEGACY_MACOS_MAJOR} or newer; this Mac is running macOS ${version}.`,
    )
    console.error('Upgrade macOS, then reinstall or run openbuff again.')
    console.error('')
    process.exit(1)
  }
  const hardwareArch = getHardwareArch()
  if (
    (hardwareArch === 'x64' && process.arch === 'x64') ||
    (hardwareArch === 'arm64' && ['x64', 'arm64'].includes(process.arch))
  ) {
    return
  }

  console.error(
    `❌ Openbuff does not have a compatible macOS ${major} binary for architecture ${hardwareArch}/${process.arch}.`,
  )
  console.error('Upgrade macOS, then reinstall or run openbuff again.')
  console.error('')
  process.exit(1)
}

function getPlatformKey() {
  if (process.platform === 'darwin') {
    const major = Number.parseInt(getMacOSVersion()?.split('.')[0] ?? '', 10)
    if (
      Number.isFinite(major) &&
      major >= MIN_LEGACY_MACOS_MAJOR &&
      major < MIN_SUPPORTED_MACOS_MAJOR
    ) {
      const hardwareArch = getHardwareArch()
      if (hardwareArch === 'arm64') return 'darwin-arm64-legacy'
      if (process.arch === 'x64' && hardwareArch === 'x64') {
        return 'darwin-x64-legacy'
      }
    }
  }

  if (
    process.platform === 'darwin' &&
    process.arch === 'x64' &&
    getHardwareArch() === 'arm64'
  ) {
    return 'darwin-arm64'
  }

  return `${process.platform}-${process.arch}`
}

const term = {
  clearLine: () => {
    if (process.stderr.isTTY) {
      process.stderr.write('\r\x1b[K')
    }
  },
  write: (text) => {
    term.clearLine()
    process.stderr.write(text)
  },
  writeLine: (text) => {
    term.clearLine()
    process.stderr.write(text + '\n')
  },
}

async function getLatestVersion() {
  try {
    const res = await httpGet(
      `https://registry.npmjs.org/${npmPackageName}/latest`,
    )

    if (res.statusCode !== 200) return null

    const body = await streamToString(res)
    const packageData = JSON.parse(body)

    return packageData.version || null
  } catch (error) {
    return null
  }
}

function getLocalPackageVersion() {
  const packageJsonPaths = [
    path.join(__dirname, 'package.json'),
    path.join(__dirname, '..', 'package.json'),
  ]

  for (const packageJsonPath of packageJsonPaths) {
    try {
      if (!fs.existsSync(packageJsonPath)) continue
      const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (packageData.version) return packageData.version
    } catch (error) {
      // Try the next local source.
    }
  }

  return null
}

function getMetadataVersion() {
  try {
    if (!fs.existsSync(CONFIG.metadataPath)) {
      return null
    }
    const metadata = JSON.parse(fs.readFileSync(CONFIG.metadataPath, 'utf8'))
    return metadata.version || null
  } catch (error) {
    return null
  }
}

function getPendingUpdateVersion() {
  try {
    if (!fs.existsSync(CONFIG.metadataPath)) return null
    const metadata = JSON.parse(fs.readFileSync(CONFIG.metadataPath, 'utf8'))
    return metadata.pendingVersion || null
  } catch {
    return null
  }
}

function writePendingUpdateVersion(version) {
  fs.mkdirSync(CONFIG.configDir, { recursive: true })
  let metadata = {}
  try {
    if (fs.existsSync(CONFIG.metadataPath)) {
      metadata = JSON.parse(fs.readFileSync(CONFIG.metadataPath, 'utf8'))
    }
  } catch {
    metadata = {}
  }
  const tempPath = `${CONFIG.metadataPath}.tmp-${process.pid}`
  fs.writeFileSync(
    tempPath,
    JSON.stringify({ ...metadata, pendingVersion: version }, null, 2),
  )
  try {
    fs.renameSync(tempPath, CONFIG.metadataPath)
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) throw error
    fs.unlinkSync(CONFIG.metadataPath)
    fs.renameSync(tempPath, CONFIG.metadataPath)
  }
}

function getWrapperVersion() {
  return (
    getLocalPackageVersion() ||
    getMetadataVersion() ||
    getCurrentVersion() ||
    'dev'
  )
}

function isVersionFlag(args) {
  return args.length === 1 && (args[0] === '--version' || args[0] === '-v')
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    let data = ''
    stream.on('data', (chunk) => (data += chunk))
    stream.on('end', () => resolve(data))
    stream.on('error', reject)
  })
}

function getCurrentVersion() {
  try {
    if (!fs.existsSync(CONFIG.metadataPath)) {
      return null
    }
    const metadata = JSON.parse(fs.readFileSync(CONFIG.metadataPath, 'utf8'))
    const platformKey = getPlatformKey()
    const nodePlatformKey = `${process.platform}-${process.arch}`
    if (metadata.platformKey && metadata.platformKey !== platformKey) {
      return null
    }
    if (!metadata.platformKey && platformKey !== nodePlatformKey) {
      return null
    }
    // Also verify the binary still exists
    if (!fs.existsSync(CONFIG.binaryPath)) {
      return null
    }
    return metadata.version || null
  } catch (error) {
    return null
  }
}

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0

  // Always update if the current version is not a valid semver
  // e.g. a local development label such as "dev"
  if (!v1.match(/^\d+(\.\d+)*(?:-[0-9A-Za-z.-]+)?$/)) {
    return -1
  }

  const parseVersion = (version) => {
    const parts = version.split('-')
    const mainParts = parts[0].split('.').map(Number)
    const prereleaseParts = parts[1] ? parts[1].split('.') : []
    return { main: mainParts, prerelease: prereleaseParts }
  }

  const p1 = parseVersion(v1)
  const p2 = parseVersion(v2)

  for (let i = 0; i < Math.max(p1.main.length, p2.main.length); i++) {
    const n1 = p1.main[i] || 0
    const n2 = p2.main[i] || 0

    if (n1 < n2) return -1
    if (n1 > n2) return 1
  }

  if (p1.prerelease.length === 0 && p2.prerelease.length === 0) {
    return 0
  } else if (p1.prerelease.length === 0) {
    return 1
  } else if (p2.prerelease.length === 0) {
    return -1
  } else {
    for (
      let i = 0;
      i < Math.max(p1.prerelease.length, p2.prerelease.length);
      i++
    ) {
      const pr1 = p1.prerelease[i] || ''
      const pr2 = p2.prerelease[i] || ''

      const isNum1 = !isNaN(parseInt(pr1))
      const isNum2 = !isNaN(parseInt(pr2))

      if (isNum1 && isNum2) {
        const num1 = parseInt(pr1)
        const num2 = parseInt(pr2)
        if (num1 < num2) return -1
        if (num1 > num2) return 1
      } else if (isNum1 && !isNum2) {
        return 1
      } else if (!isNum1 && isNum2) {
        return -1
      } else if (pr1 < pr2) {
        return -1
      } else if (pr1 > pr2) {
        return 1
      }
    }
    return 0
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function createProgressBar(percentage, width = 30) {
  const filled = Math.round((width * percentage) / 100)
  const empty = width - filled
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']'
}

function getReleaseAssetBase(version) {
  const downloadBase =
    process.env.OPENBUFF_DOWNLOAD_BASE ||
    'https://github.com/AnzoBenjamin/openbuff/releases/download'
  return `${downloadBase}/v${version}`
}

async function getExpectedChecksum(version, fileName) {
  const checksumResponse = await httpGet(
    `${getReleaseAssetBase(version)}/SHA256SUMS`,
  )
  if (checksumResponse.statusCode !== 200) {
    checksumResponse.resume()
    throw new Error(
      `Checksum manifest download failed: HTTP ${checksumResponse.statusCode}`,
    )
  }

  return parseExpectedChecksum(await streamToString(checksumResponse), fileName)
}

function parseExpectedChecksum(checksumText, fileName) {
  for (const line of checksumText.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/)
    if (match && path.basename(match[2]) === fileName) {
      return match[1].toLowerCase()
    }
  }

  throw new Error(`Checksum missing for release asset ${fileName}`)
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function downloadResponseToFile(response, destination, totalSize) {
  return new Promise((resolve, reject) => {
    let downloadedSize = 0
    let lastProgressTime = Date.now()
    const output = fs.createWriteStream(destination, { mode: 0o600 })

    response.on('data', (chunk) => {
      downloadedSize += chunk.length
      const now = Date.now()
      if (now - lastProgressTime < 100 && downloadedSize !== totalSize) return
      lastProgressTime = now
      if (totalSize > 0) {
        const pct = Math.round((downloadedSize / totalSize) * 100)
        term.write(
          `Downloading... ${createProgressBar(pct)} ${pct}% of ${formatBytes(totalSize)}`,
        )
      } else {
        term.write(`Downloading... ${formatBytes(downloadedSize)}`)
      }
    })
    response.on('error', reject)
    output.on('error', reject)
    output.on('finish', resolve)
    response.pipe(output)
  })
}

async function downloadBinary(version) {
  const platformKey = getPlatformKey()
  const fileName = PLATFORM_TARGETS[platformKey]

  if (!fileName) {
    const error = new Error(
      `Unsupported platform: ${process.platform} ${process.arch}`,
    )
    trackUpdateFailed(error.message, version, {
      stage: 'platform_check',
      platformKey,
    })
    throw error
  }

  // Binaries are hosted as GitHub Release assets on the public repo.
  // Public repo → unauthenticated downloads; GitHub 302-redirects to a CDN,
  // and the http.js client follows redirects. OPENBUFF_DOWNLOAD_BASE may
  // override the base (e.g. for staging mirrors).
  const downloadUrl = `${getReleaseAssetBase(version)}/${fileName}`

  // Ensure config directory exists
  fs.mkdirSync(CONFIG.configDir, { recursive: true })

  // Clean up any previous temp download directory
  if (fs.existsSync(CONFIG.tempDownloadDir)) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
  }
  fs.mkdirSync(CONFIG.tempDownloadDir, { recursive: true })

  term.write('Downloading...')

  let expectedChecksum
  try {
    expectedChecksum = await getExpectedChecksum(version, fileName)
  } catch (error) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    trackUpdateFailed(error.message, version, { stage: 'checksum_manifest' })
    throw error
  }

  const res = await httpGet(downloadUrl)

  if (res.statusCode !== 200) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    const error = new Error(`Download failed: HTTP ${res.statusCode}`)
    trackUpdateFailed(error.message, version, {
      stage: 'http_download',
      statusCode: res.statusCode,
    })
    throw error
  }

  const totalSize = parseInt(res.headers['content-length'] || '0', 10)
  const archivePath = path.join(CONFIG.tempDownloadDir, fileName)
  await downloadResponseToFile(res, archivePath, totalSize)

  const actualChecksum = await hashFile(archivePath)
  if (actualChecksum !== expectedChecksum) {
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    const error = new Error(
      `Checksum verification failed for ${fileName}: expected ${expectedChecksum}, received ${actualChecksum}`,
    )
    trackUpdateFailed(error.message, version, { stage: 'checksum_verify' })
    throw error
  }

  // Extract only after the archive has passed integrity verification.
  const tar = require('tar')
  await tar.x({
    cwd: CONFIG.tempDownloadDir,
    file: archivePath,
    preservePaths: false,
    strict: true,
  })

  const extractedAssetProblems = getTreeSitterAssetProblems(
    CONFIG.tempDownloadDir,
  )
  if (extractedAssetProblems.length) {
    throw new Error(
      `Release archive has incomplete tree-sitter assets: ${extractedAssetProblems.join(', ')}`,
    )
  }

  const tempBinaryPath = path.join(CONFIG.tempDownloadDir, CONFIG.binaryName)

  // Verify the binary was extracted
  if (!fs.existsSync(tempBinaryPath)) {
    const files = fs.readdirSync(CONFIG.tempDownloadDir)
    fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    const error = new Error(
      `Binary not found after extraction. Expected: ${CONFIG.binaryName}, Available files: ${files.join(', ')}`,
    )
    trackUpdateFailed(error.message, version, { stage: 'extraction' })
    throw error
  }

  // Set executable permissions
  if (process.platform !== 'win32') {
    fs.chmodSync(tempBinaryPath, 0o755)
  }

  // Move binary to final location
  try {
    if (fs.existsSync(CONFIG.binaryPath)) {
      try {
        fs.unlinkSync(CONFIG.binaryPath)
      } catch (err) {
        // Fallback: try renaming the locked/undeletable binary (Windows)
        const backupPath = CONFIG.binaryPath + `.old.${Date.now()}`
        try {
          fs.renameSync(CONFIG.binaryPath, backupPath)
        } catch (renameErr) {
          throw new Error(
            `Failed to replace existing binary. ` +
              `unlink error: ${err.code || err.message}, ` +
              `rename error: ${renameErr.code || renameErr.message}`,
          )
        }
      }
    }
    fs.renameSync(tempBinaryPath, CONFIG.binaryPath)

    // Preserve every managed sibling extracted from the release archive.
    // This includes the parser runtime, all language grammar WASMs, and
    // legacy native/ripgrep assets. Deriving the grammar list from the
    // archive keeps the installer aligned with the build manifest.
    for (const siblingName of getManagedSiblingNames(CONFIG.tempDownloadDir)) {
      const tempSiblingPath = path.join(CONFIG.tempDownloadDir, siblingName)
      if (!fs.existsSync(tempSiblingPath)) continue
      const targetSiblingPath = path.join(
        path.dirname(CONFIG.binaryPath),
        siblingName,
      )
      try {
        if (fs.existsSync(targetSiblingPath)) fs.unlinkSync(targetSiblingPath)
      } catch {
        // best effort; rename below will surface the real error if it matters
      }
      fs.renameSync(tempSiblingPath, targetSiblingPath)
      if (process.platform !== 'win32' && siblingName === 'rg') {
        fs.chmodSync(targetSiblingPath, 0o755)
      }
    }

    // Save version metadata for fast version checking
    fs.writeFileSync(
      CONFIG.metadataPath,
      JSON.stringify({ version, platformKey }, null, 2),
    )
  } finally {
    // Clean up temp directory even if rename fails
    if (fs.existsSync(CONFIG.tempDownloadDir)) {
      fs.rmSync(CONFIG.tempDownloadDir, { recursive: true })
    }
  }

  term.clearLine()
  console.log('Download complete! Starting Openbuff...')
}

async function ensureBinaryExists() {
  const currentVersion = getCurrentVersion()
  const assetProblems = currentVersion
    ? getTreeSitterAssetProblems(CONFIG.configDir)
    : []
  const pendingVersion = getPendingUpdateVersion()
  const packagedVersion = getLocalPackageVersion()
  const packagedUpdate =
    packagedVersion &&
    (currentVersion === null ||
      compareVersions(currentVersion, packagedVersion) < 0)
      ? packagedVersion
      : null
  const requestedVersion =
    pendingVersion ||
    packagedUpdate ||
    (assetProblems.length ? currentVersion : null)

  if (currentVersion !== null && !requestedVersion) {
    return
  }

  if (assetProblems.length) {
    console.error(
      `Repairing incomplete tree-sitter assets: ${assetProblems.join(', ')}`,
    )
  }

  const version = requestedVersion || (await getLatestVersion())
  if (!version) {
    console.error('❌ Failed to determine latest version')
    console.error('Please check your internet connection and try again')
    if (!getProxyUrl()) {
      console.error(
        'If you are behind a proxy, set the HTTPS_PROXY environment variable',
      )
    }
    process.exit(1)
  }

  try {
    await downloadBinary(version)
  } catch (error) {
    term.clearLine()
    console.error('❌ Failed to download openbuff:', error.message)
    console.error('Please check your internet connection and try again')
    if (!getProxyUrl()) {
      console.error(
        'If you are behind a proxy, set the HTTPS_PROXY environment variable',
      )
    }
    process.exit(1)
  }
}

async function checkForUpdates() {
  try {
    const currentVersion = getCurrentVersion()

    const latestVersion = await getLatestVersion()
    if (!latestVersion) return

    if (
      // Download new version if current version is unknown or outdated.
      currentVersion === null ||
      compareVersions(currentVersion, latestVersion) < 0
    ) {
      term.clearLine()
      console.error(
        `Openbuff update available: ${currentVersion ?? 'unknown'} → ${latestVersion}. It will be installed on the next launch.`,
      )
      writePendingUpdateVersion(latestVersion)
    }
  } catch (error) {
    trackUpdateFailed(error.message, null, { stage: 'background_check' })
  }
}

function printCrashDiagnostics(code, signal) {
  // Windows NTSTATUS codes (unsigned DWORD)
  const unsignedCode = code != null && code < 0 ? code >>> 0 : code
  const isIllegalInstruction =
    signal === 'SIGILL' ||
    (process.platform === 'win32' && unsignedCode === 0xc000001d)
  const isAccessViolation =
    signal === 'SIGSEGV' ||
    (process.platform === 'win32' && unsignedCode === 0xc0000005)
  const isBusError = signal === 'SIGBUS'
  const isAbort =
    signal === 'SIGABRT' ||
    (process.platform === 'win32' && unsignedCode === 0xc0000409)

  if (!isIllegalInstruction && !isAccessViolation && !isBusError && !isAbort)
    return

  const exitInfo = signal ? `signal ${signal}` : `code ${code}`
  const platformKey = getPlatformKey()
  const target = PLATFORM_TARGETS[platformKey] || 'unsupported'
  const cpuInfo = getCpuCompatibilityInfo(platformKey)
  console.error('')
  console.error(`❌ ${binaryName} exited immediately (${exitInfo})`)
  console.error('')

  if (isIllegalInstruction) {
    for (const line of getIllegalInstructionGuidance(cpuInfo)) {
      console.error(line)
    }
    console.error('')
  } else if (isAccessViolation) {
    console.error('The binary crashed with an access violation.')
    console.error('')
  } else if (isBusError) {
    console.error('The binary crashed with a bus error.')
    console.error('This may indicate a platform compatibility issue.')
    console.error('')
  } else if (isAbort) {
    console.error('The binary crashed with an abort signal.')
    console.error('')
  }

  console.error('System info:')
  console.error(`  Platform: ${process.platform} ${process.arch}`)
  console.error(`  Hardware: ${getHardwareArch()}`)
  console.error(`  CPU:      ${cpuInfo.model ?? 'unknown'}`)
  console.error(
    `  AVX2:     ${!cpuInfo.avx2Applicable ? 'not applicable' : cpuInfo.avx2 === true ? 'supported' : cpuInfo.avx2 === false ? 'not reported' : 'unknown'}`,
  )
  if (process.platform === 'darwin') {
    console.error(`  macOS:    ${getMacOSVersion() ?? 'unknown'}`)
  }
  console.error(`  Target:   ${platformKey} (${target})`)
  console.error(`  Wrapper:  ${getWrapperVersion()}`)
  console.error(`  Installed: ${getMetadataVersion() ?? 'unknown'}`)
  console.error(`  Node:     ${process.version}`)
  console.error(`  Binary:   ${CONFIG.binaryPath}`)
  console.error('')
  console.error('Please report this issue at:')
  console.error('  https://github.com/AnzoBenjamin/openbuff/issues')
  console.error('')
}

async function main() {
  const args = process.argv.slice(2)

  if (isVersionFlag(args)) {
    console.log(getWrapperVersion())
    return
  }

  assertSupportedPlatform()

  if (process.platform === 'win32') {
    cleanupOldBinaryBackups(CONFIG.binaryPath)
  }

  await ensureBinaryExists()

  const child = spawn(CONFIG.binaryPath, args, {
    stdio: 'inherit',
  })

  const exitListener = (code, signal) => {
    resetTerminal()
    printCrashDiagnostics(code, signal)
    process.exit(signal ? 1 : code || 0)
  }

  child.on('exit', exitListener)

  child.on('error', (err) => {
    console.error('Failed to start openbuff:', err.message)
    process.exit(1)
  })

  setTimeout(() => {
    checkForUpdates()
  }, 100)
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error.message)
    process.exit(1)
  })
}

module.exports = {
  cleanupOldBinaryBackups,
  compareVersions,
  getIllegalInstructionGuidance,
  getManagedSiblingNames,
  getTreeSitterAssetProblems,
  parseExpectedChecksum,
  parseLinuxCpuInfo,
  resolveConfigDir,
}
