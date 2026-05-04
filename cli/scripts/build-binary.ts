#!/usr/bin/env bun

import { spawnSync, type SpawnSyncOptions } from 'child_process'
import { createRequire } from 'module'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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

  // Ensure SDK assets exist before compiling the CLI
  log('Building SDK dependencies...')
  runCommand('bun', ['run', '--cwd', '../sdk', 'build'], {
    cwd: cliRoot,
    env: process.env,
  })

  patchOpenTuiAssetPaths()
  await ensureOpenTuiNativeBundle(targetInfo)

  const wasmCopy = stagePreInitWasm()
  // Even on a build-script crash, leave the developer's working tree clean.
  process.on('exit', wasmCopy.cleanup)

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
    [
      'process.env.CODEBUFF_CLI_TARGET',
      `"${targetInfo.platform}-${targetInfo.arch}"`,
    ],
    ['process.env.FREEBUFF_MODE', `"${process.env.FREEBUFF_MODE ?? 'false'}"`],
    ...nextPublicEnvVars,
  ]

  const buildArgs = [
    'build',
    'src/index.tsx',
    '--compile',
    '--production', // Required so compiled binaries use the production JSX runtime (avoids jsxDEV crashes).
    `--target=${targetInfo.bunTarget}`,
    `--outfile=${outputFile}`,
    '--sourcemap=none',
    ...defineFlags.flatMap(([key, value]) => ['--define', `${key}=${value}`]),
    '--env "NEXT_PUBLIC_*"', // Copies all current env vars in process.env to the compiled binary that match the pattern.
  ]

  log(
    `bun ${buildArgs
      .map((arg) => (arg.includes(' ') ? `"${arg}"` : arg))
      .join(' ')}`,
  )

  runCommand('bun', buildArgs, { cwd: cliRoot })

  // Remove the staged pre-init wasm now that the build has read it. Eager
  // cleanup keeps a successful build clean; the exit handler above is a
  // backstop for crashes between stage and now.
  wasmCopy.cleanup()

  // Fail the build if the wasm asset didn't actually make it into the
  // compiled binary. The pre-init imports tree-sitter.wasm with `with {
  // type: 'file' }`, which Bun should embed; this scan catches silent
  // regressions (e.g. tree-shaking eliminating the import) before we ship
  // a broken artifact.
  verifyTreeSitterWasmEmbedded(outputFile)

  if (targetInfo.platform !== 'win32') {
    chmodSync(outputFile, 0o755)
  }

  logAlways(
    `✅ Built ${outputFilename} (${targetInfo.platform}-${targetInfo.arch})`,
  )
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
    join(cliRoot, '..', 'sdk', 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
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

/**
 * Copy `tree-sitter.wasm` into `cli/src/pre-init/` so the pre-init module
 * can import it via a relative `with { type: 'file' }` path. We can't
 * import it directly as a node_modules subpath: on Windows, bun's
 * `with { type: 'file' }` resolution returned falsy at runtime for
 * `web-tree-sitter/tree-sitter.wasm` even though the bytes ended up in
 * the binary, breaking the pre-init's runtime path lookup. OpenTUI's own
 * tree-sitter assets work because they're imported relatively from
 * inside the package — same trick here.
 *
 * Returns a cleanup function. The build calls it eagerly after compile
 * and registers it as an exit handler so a mid-build crash doesn't leave
 * a multi-MB untracked file in the working tree.
 */
function stagePreInitWasm(): { cleanup: () => void } {
  const sourceWasm = findWebTreeSitterWasm()
  const stagedPath = join(cliRoot, 'src', 'pre-init', 'tree-sitter.wasm')
  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    if (existsSync(stagedPath)) {
      try {
        rmSync(stagedPath)
      } catch (error) {
        console.error('Failed to remove staged pre-init wasm:', error)
      }
    }
  }

  // Read + write rather than copyFile so we don't accidentally hardlink
  // (some Windows hosts fail to delete hardlinks while bun has the file
  // mmapped from the compile step).
  writeFileSync(stagedPath, readFileSync(sourceWasm))
  logAlways(`Staged pre-init wasm: ${sourceWasm} → ${stagedPath}`)
  return { cleanup }
}

/**
 * Sanity-check the compiled binary actually contains web-tree-sitter's
 * tree-sitter.wasm. The pre-init imports it via `with { type: 'file' }`,
 * which should bundle the asset at a bunfs path. If tree-shaking or a
 * future bundler change drops the import, the binary still compiles but
 * tree-sitter init fails at runtime — this scan fails the build before
 * we upload that artifact.
 *
 * Looks for the actual wasm bytes (a unique 64-byte chunk pulled from
 * the source file's interior), not just the wasm magic header — OpenTUI
 * embeds its own tree-sitter language wasms, so a magic-bytes-only scan
 * would false-pass even without our import. A literal bytes match
 * proves *this specific* wasm shipped.
 */
function verifyTreeSitterWasmEmbedded(outputFile: string): void {
  const wasmPath = findWebTreeSitterWasm()
  const wasm = readFileSync(wasmPath)
  // Take a 64-byte slice from the middle of the file. The header has
  // generic wasm magic + section markers; the tail can be padding. The
  // middle is densely packed code/data unique to this specific wasm
  // module.
  const needleStart = Math.floor(wasm.length / 2)
  const needle = wasm.subarray(needleStart, needleStart + 64)

  const binary = readFileSync(outputFile)
  const idx = binary.indexOf(needle)
  if (idx === -1) {
    throw new Error(
      `web-tree-sitter wasm content not found in ${outputFile}.\n` +
        `Source wasm: ${wasmPath} (${wasm.length} bytes)\n` +
        `Searched for 64 bytes from offset ${needleStart} of the source.\n` +
        `Either the \`with { type: 'file' }\` import in the pre-init was\n` +
        `tree-shaken out, or bun --compile didn't embed the asset on this\n` +
        `platform. The runtime tree-sitter init would fail with\n` +
        `"Internal error: tree-sitter.wasm not found".`,
    )
  }
  logAlways(
    `Verified embedded tree-sitter.wasm at offset ${idx} of compiled binary (source: ${wasmPath}).`,
  )
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
