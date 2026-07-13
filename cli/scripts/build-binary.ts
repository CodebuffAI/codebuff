#!/usr/bin/env bun

import { spawnSync, type SpawnSyncOptions } from 'child_process'
import { createHash } from 'crypto'
import { createRequire } from 'module'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { LANGUAGE_WASM_FILES } from '../../packages/code-map/src/wasm-files'

type TargetInfo = {
  bunTarget: string
  platform: NodeJS.Platform
  arch: string
}

const VERBOSE = process.env.VERBOSE === 'true'
const OVERRIDE_TARGET = process.env.OVERRIDE_TARGET
const OVERRIDE_PLATFORM = process.env.OVERRIDE_PLATFORM as
  | NodeJS.Platform
  | undefined
const OVERRIDE_ARCH = process.env.OVERRIDE_ARCH ?? undefined
const COMPILER_BIN = process.env.OPENBUFF_COMPILER_BIN ?? 'bun'
const IS_LEGACY_MACOS_BUILD = process.env.OPENBUFF_LEGACY_MACOS_BUILD === 'true'
const LEGACY_OPENTUI_LIB = process.env.OPENBUFF_LEGACY_OPENTUI_LIB
const LEGACY_RIPGREP_BIN = process.env.OPENBUFF_LEGACY_RIPGREP_BIN

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const cliRoot = join(__dirname, '..')
const repoRoot = dirname(cliRoot)

function log(message: string) {
  if (VERBOSE) {
    console.log(message)
  }
}

function logAlways(message: string) {
  console.log(message)
}

function runCommand(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: VERBOSE ? 'inherit' : 'pipe',
    env: options.env,
  })

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() ?? ''
    throw new Error(
      `Command "${command} ${args.join(' ')}" failed with exit code ${
        result.status
      }${stderr ? `\n${stderr}` : ''}`,
    )
  }
}

function getTargetInfo(): TargetInfo {
  if (OVERRIDE_TARGET && OVERRIDE_PLATFORM && OVERRIDE_ARCH) {
    return {
      bunTarget: OVERRIDE_TARGET,
      platform: OVERRIDE_PLATFORM,
      arch: OVERRIDE_ARCH,
    }
  }

  const platform = process.platform
  const arch = process.arch

  const mappings: Record<string, TargetInfo> = {
    'linux-x64': { bunTarget: 'bun-linux-x64', platform: 'linux', arch: 'x64' },
    'linux-arm64': {
      bunTarget: 'bun-linux-arm64',
      platform: 'linux',
      arch: 'arm64',
    },
    'darwin-x64': {
      bunTarget: 'bun-darwin-x64',
      platform: 'darwin',
      arch: 'x64',
    },
    'darwin-arm64': {
      bunTarget: 'bun-darwin-arm64',
      platform: 'darwin',
      arch: 'arm64',
    },
    'win32-x64': {
      bunTarget: 'bun-windows-x64',
      platform: 'win32',
      arch: 'x64',
    },
  }

  const key = `${platform}-${arch}`
  const target = mappings[key]

  if (!target) {
    throw new Error(`Unsupported build target: ${key}`)
  }

  return target
}

async function main() {
  const [, , binaryNameArg, version] = process.argv
  const binaryName = binaryNameArg ?? 'codecane'

  if (!version) {
    throw new Error('Version argument is required when building a binary')
  }

  log(`Building ${binaryName} @ ${version}`)

  const targetInfo = getTargetInfo()
  const binDir = join(cliRoot, 'bin')

  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  // Generate bundled agents file before compiling
  log('Generating bundled agents...')
  runCommand('bun', ['run', 'scripts/prebuild-agents.ts'], {
    cwd: cliRoot,
    env: process.env,
  })
  runCommand('bun', ['run', 'scripts/generate-init-type-sources.ts'], {
    cwd: cliRoot,
    env: process.env,
  })

  // Ensure SDK assets exist before compiling the CLI
  log('Building SDK dependencies...')
  runCommand('bun', ['run', '--cwd', '../sdk', 'build'], {
    cwd: cliRoot,
    env: process.env,
  })

  patchOpenTuiAssetPaths()
  if (IS_LEGACY_MACOS_BUILD) {
    assertLegacyMacOSBuildConfig(targetInfo)
    patchOpenTuiNativeEntryForLegacy(targetInfo)
  } else {
    await ensureOpenTuiNativeBundle(targetInfo)
  }

  const outputFilename =
    targetInfo.platform === 'win32' ? `${binaryName}.exe` : binaryName
  const outputFile = join(binDir, outputFilename)

  // Collect all NEXT_PUBLIC_* environment variables
  const nextPublicEnvVars = Object.entries(process.env)
    .filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
    .map(([key, value]) => [`process.env.${key}`, `"${value ?? ''}"`])

  const defineFlags = [
    ['process.env.NODE_ENV', '"production"'],
    ['process.env.CODEBUFF_IS_BINARY', '"true"'],
    ['process.env.CODEBUFF_CLI_VERSION', `"${version}"`],
    ['process.env.DEV', '"false"'],
    [
      'process.env.CODEBUFF_CLI_LEGACY_MACOS',
      IS_LEGACY_MACOS_BUILD ? '"true"' : '"false"',
    ],
    [
      'process.env.CODEBUFF_CLI_TARGET',
      IS_LEGACY_MACOS_BUILD
        ? '"darwin-x64-legacy"'
        : `"${targetInfo.platform}-${targetInfo.arch}"`,
    ],
    ...nextPublicEnvVars,
  ]

  const buildArgs = [
    'build',
    'src/index.tsx',
    '--compile',
    `--outfile=${outputFile}`,
    '--sourcemap=none',
    ...defineFlags.flatMap(([key, value]) => ['--define', `${key}=${value}`]),
  ]

  if (!IS_LEGACY_MACOS_BUILD) {
    // Required so compiled binaries use the production JSX runtime (avoids
    // jsxDEV crashes). Bun 1.0's compiler predates these flags, so the legacy
    // lane uses explicit defines above instead.
    buildArgs.splice(3, 0, '--production', `--target=${targetInfo.bunTarget}`)
    buildArgs.push('--env "NEXT_PUBLIC_*"')
  } else {
    buildArgs.push('--conditions=production')
  }

  log(
    `${COMPILER_BIN} ${buildArgs
      .map((arg) => (arg.includes(' ') ? `"${arg}"` : arg))
      .join(' ')}`,
  )

  runCommand(COMPILER_BIN, buildArgs, { cwd: cliRoot })

  // Bun 1.0 writes a compiled executable next to the entrypoint even when an
  // absolute --outfile is provided. Normalize it into cli/bin for packaging.
  if (IS_LEGACY_MACOS_BUILD && !existsSync(outputFile)) {
    const legacyOutput = join(cliRoot, 'src', outputFilename)
    if (!existsSync(legacyOutput)) {
      throw new Error(
        `Legacy compiler did not produce ${outputFile} or ${legacyOutput}`,
      )
    }
    renameSync(legacyOutput, outputFile)
  }

  if (IS_LEGACY_MACOS_BUILD) {
    copyFileSync(LEGACY_OPENTUI_LIB!, join(binDir, 'libopentui.dylib'))
    copyFileSync(LEGACY_RIPGREP_BIN!, join(binDir, 'rg'))
    chmodSync(join(binDir, 'rg'), 0o755)
  }

  // Ship tree-sitter.wasm as a sibling file next to the binary. Bun
  // --compile asset embedding is unreliable on Windows (every JS-level
  // retrieval mechanism we tried — `with { type: 'file' }`, base64 string
  // literals, chunked base64, function-wrapped chunked base64 — got
  // tree-shaken, minified away, or returned an undefined binding even
  // when the bytes were in the binary). The pre-init reads it from
  // `dirname(process.execPath)`, which works the same on every platform
  // because it's a normal disk read, not a bunfs lookup.
  const sourceWasm = findWebTreeSitterWasm()
  const siblingWasm = join(binDir, 'tree-sitter.wasm')
  writeFileSync(siblingWasm, readFileSync(sourceWasm))
  logAlways(`Copied tree-sitter.wasm sibling: ${sourceWasm} → ${siblingWasm}`)
  let copiedGrammarCount = 0
  const wasmManifest: Record<string, string> = {
    'tree-sitter.wasm': createHash('sha256')
      .update(readFileSync(siblingWasm))
      .digest('hex'),
  }
  for (const wasmFile of LANGUAGE_WASM_FILES) {
    const source = findGrammarWasmSource(wasmFile)
    copyFileSync(source, join(binDir, wasmFile))
    wasmManifest[wasmFile] = createHash('sha256')
      .update(readFileSync(source))
      .digest('hex')
    copiedGrammarCount++
  }
  writeFileSync(
    join(binDir, 'tree-sitter-manifest.json'),
    `${JSON.stringify({ schemaVersion: 1, files: wasmManifest }, null, 2)}\n`,
  )
  logAlways(`Copied ${copiedGrammarCount} tree-sitter language grammars`)

  if (targetInfo.platform !== 'win32') {
    chmodSync(outputFile, 0o755)
  }

  logAlways(
    `✅ Built ${outputFilename} (${targetInfo.platform}-${targetInfo.arch})`,
  )
}

function assertLegacyMacOSBuildConfig(targetInfo: TargetInfo) {
  if (targetInfo.platform !== 'darwin' || targetInfo.arch !== 'x64') {
    throw new Error('The legacy macOS build is supported only for darwin-x64')
  }
  if (!LEGACY_OPENTUI_LIB || !existsSync(LEGACY_OPENTUI_LIB)) {
    throw new Error(
      'OPENBUFF_LEGACY_OPENTUI_LIB must point to a macOS 11-compatible libopentui.dylib',
    )
  }
  if (!LEGACY_RIPGREP_BIN || !existsSync(LEGACY_RIPGREP_BIN)) {
    throw new Error(
      'OPENBUFF_LEGACY_RIPGREP_BIN must point to a macOS 11-compatible rg binary',
    )
  }
}

function patchOpenTuiNativeEntryForLegacy(targetInfo: TargetInfo) {
  const packageFolder = `core-${targetInfo.platform}-${targetInfo.arch}`
  const entryPaths = [
    join(repoRoot, 'node_modules', '@opentui', packageFolder, 'index.ts'),
    join(cliRoot, 'node_modules', '@opentui', packageFolder, 'index.ts'),
  ]
  const entrySource = `import { dirname, join } from 'path'\n\nexport default join(dirname(process.execPath), 'libopentui.dylib')\n`

  let patched = 0
  for (const entryPath of entryPaths) {
    if (!existsSync(entryPath)) continue
    writeFileSync(entryPath, entrySource)
    patched++
  }
  if (patched === 0) {
    throw new Error(`Could not find @opentui/${packageFolder}/index.ts`)
  }
  logAlways(`Patched ${patched} OpenTUI native entries for legacy macOS`)
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }
  process.exit(1)
})

/**
 * Find web-tree-sitter's tree-sitter.wasm in any plausible node_modules
 * layout — bun hoists differently across platforms and `bun install`
 * variants, and CI Windows lays it out differently than monorepo-root
 * installs.
 */
function findWebTreeSitterWasm(): string {
  const candidates = [
    join(cliRoot, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
    join(cliRoot, '..', 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
    join(
      cliRoot,
      '..',
      'sdk',
      'node_modules',
      'web-tree-sitter',
      'tree-sitter.wasm',
    ),
  ]
  const found = candidates.find((p) => existsSync(p))
  if (found) return found
  try {
    const cliRequire = createRequire(join(cliRoot, 'package.json'))
    return cliRequire.resolve('web-tree-sitter/tree-sitter.wasm')
  } catch (err) {
    throw new Error(
      `Could not locate web-tree-sitter/tree-sitter.wasm. Searched:\n  - ` +
        candidates.join('\n  - ') +
        `\nAnd createRequire failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

function findGrammarWasmSource(wasmFile: string): string {
  const treeSitterWasmsName =
    wasmFile === 'tree-sitter-c-sharp.wasm'
      ? 'tree-sitter-c_sharp.wasm'
      : wasmFile
  const candidates = [
    join(repoRoot, 'node_modules', 'tree-sitter-wasms', 'out', treeSitterWasmsName),
    join(cliRoot, 'node_modules', 'tree-sitter-wasms', 'out', treeSitterWasmsName),
    join(repoRoot, 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm', wasmFile),
    join(cliRoot, 'node_modules', '@vscode', 'tree-sitter-wasm', 'wasm', wasmFile),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(
      `Could not locate required tree-sitter grammar ${wasmFile}. Searched:\n  - ${candidates.join('\n  - ')}`,
    )
  }
  return found
}

function patchOpenTuiAssetPaths() {
  const coreDir = join(cliRoot, 'node_modules', '@opentui', 'core')
  if (!existsSync(coreDir)) {
    log('OpenTUI core package not found; skipping asset patch')
    return
  }

  const indexFile = readdirSync(coreDir).find(
    (file) => file.startsWith('index') && file.endsWith('.js'),
  )

  if (!indexFile) {
    log('OpenTUI core index bundle not found; skipping asset patch')
    return
  }

  const indexPath = join(coreDir, indexFile)
  const content = readFileSync(indexPath, 'utf8')

  const absolutePathPattern =
    /var __dirname = ".*?packages\/core\/src\/lib\/tree-sitter\/assets";/
  if (!absolutePathPattern.test(content)) {
    log('OpenTUI core bundle already has relative asset paths')
    return
  }

  const replacement =
    'var __dirname = path3.join(path3.dirname(fileURLToPath(new URL(".", import.meta.url))), "lib/tree-sitter/assets");'

  const patched = content.replace(absolutePathPattern, replacement)
  writeFileSync(indexPath, patched)
  logAlways('Patched OpenTUI core tree-sitter asset paths')
}

async function ensureOpenTuiNativeBundle(targetInfo: TargetInfo) {
  const packageName = `@opentui/core-${targetInfo.platform}-${targetInfo.arch}`
  const packageFolder = `core-${targetInfo.platform}-${targetInfo.arch}`
  const installTargets = [
    {
      label: 'workspace root',
      packagesDir: join(repoRoot, 'node_modules', '@opentui'),
      packageDir: join(repoRoot, 'node_modules', '@opentui', packageFolder),
    },
    {
      label: 'CLI workspace',
      packagesDir: join(cliRoot, 'node_modules', '@opentui'),
      packageDir: join(cliRoot, 'node_modules', '@opentui', packageFolder),
    },
  ]

  const missingTargets = installTargets.filter(
    ({ packageDir }) => !existsSync(packageDir),
  )
  if (missingTargets.length === 0) {
    log(
      `OpenTUI native bundle already present for ${targetInfo.platform}-${targetInfo.arch}`,
    )
    return
  }

  const corePackagePath =
    installTargets
      .map(({ packagesDir }) => join(packagesDir, 'core', 'package.json'))
      .find((candidate) => existsSync(candidate)) ?? null

  if (!corePackagePath) {
    log('OpenTUI core package metadata missing; skipping native bundle fetch')
    return
  }
  const corePackageJson = JSON.parse(readFileSync(corePackagePath, 'utf8')) as {
    optionalDependencies?: Record<string, string>
  }
  const version = corePackageJson.optionalDependencies?.[packageName]
  if (!version) {
    log(
      `No optional dependency declared for ${packageName}; skipping native bundle fetch`,
    )
    return
  }

  const registryBase =
    process.env.CODEBUFF_NPM_REGISTRY ??
    process.env.NPM_REGISTRY_URL ??
    'https://registry.npmjs.org'
  const metadataUrl = `${registryBase.replace(/\/$/, '')}/${encodeURIComponent(packageName)}`
  log(`Fetching OpenTUI native bundle metadata from ${metadataUrl}`)

  const metadataResponse = await fetch(metadataUrl)
  if (!metadataResponse.ok) {
    throw new Error(
      `Failed to fetch metadata for ${packageName}: ${metadataResponse.status} ${metadataResponse.statusText}`,
    )
  }

  const metadataResponseBody = await metadataResponse.json()
  const metadata = metadataResponseBody as {
    versions?: Record<
      string,
      {
        dist?: {
          tarball?: string
        }
      }
    >
  }
  const tarballUrl = metadata.versions?.[version]?.dist?.tarball
  if (!tarballUrl) {
    throw new Error(`Tarball URL missing for ${packageName}@${version}`)
  }

  log(`Downloading OpenTUI native bundle from ${tarballUrl}`)
  const tarballResponse = await fetch(tarballUrl)
  if (!tarballResponse.ok) {
    throw new Error(
      `Failed to download ${packageName}@${version}: ${tarballResponse.status} ${tarballResponse.statusText}`,
    )
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'opentui-'))
  try {
    const tarballPath = join(
      tempDir,
      `${packageName.split('/').pop() ?? 'package'}-${version}.tgz`,
    )
    const tarballBuffer = await tarballResponse.arrayBuffer()
    await Bun.write(tarballPath, tarballBuffer)

    for (const target of missingTargets) {
      mkdirSync(target.packagesDir, { recursive: true })
      mkdirSync(target.packageDir, { recursive: true })

      if (!existsSync(target.packageDir)) {
        throw new Error(
          `Failed to create directory for ${packageName}: ${target.packageDir}`,
        )
      }

      const tarballForTar =
        process.platform === 'win32'
          ? tarballPath.replace(/\\/g, '/')
          : tarballPath
      const extractDirForTar =
        process.platform === 'win32'
          ? target.packageDir.replace(/\\/g, '/')
          : target.packageDir

      const tarArgs = [
        '-xzf',
        tarballForTar,
        '--strip-components=1',
        '-C',
        extractDirForTar,
      ]
      if (process.platform === 'win32') {
        tarArgs.unshift('--force-local')
      }

      runCommand('tar', tarArgs)
      log(
        `Installed OpenTUI native bundle for ${targetInfo.platform}-${targetInfo.arch} in ${target.label}`,
      )
    }
    logAlways(
      `Fetched OpenTUI native bundle for ${targetInfo.platform}-${targetInfo.arch}`,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
