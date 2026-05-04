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

  const treeSitterEmbed = embedTreeSitterWasmAsChunks()
  // Even on a build-script crash, restore the empty stub so a developer's
  // working tree doesn't end up with a multi-MB diff.
  process.on('exit', treeSitterEmbed.restore)

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

  // Restore the empty stub now that the build read the chunks. Eager
  // cleanup keeps a successful build clean; the exit handler is a
  // backstop for crashes between embed and now.
  treeSitterEmbed.restore()

  // Fail the build if the chunks didn't actually make it into the
  // compiled binary. Catches silent regressions (tree-shaking, minifier
  // dropping literals, file-write timing) before we upload an artifact
  // that would crash for users.
  verifyTreeSitterWasmEmbedded(outputFile, treeSitterEmbed.sampleChunks)

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
 * Inline `tree-sitter.wasm` into the binary as base64-encoded string
 * literals — but split into many small chunks. A single 274KB string
 * literal got dropped/transformed by bun's Windows minifier in an
 * earlier attempt; small chunks are individually unremarkable to the
 * minifier and survive intact. The pre-init joins them at runtime and
 * decodes back to the wasm bytes.
 *
 * Returns a `restore` function (resets the stub) and a small set of
 * `sampleChunks` for the post-build verification step to look for in
 * the compiled binary. Always invoke `restore` (eagerly + on exit) so
 * a developer's working tree doesn't end up with a multi-MB diff after
 * a build.
 */
function embedTreeSitterWasmAsChunks(): {
  restore: () => void
  sampleChunks: string[]
} {
  const stubPath = join(cliRoot, 'src', 'pre-init', 'tree-sitter-wasm-bytes.ts')
  const originalStub = readFileSync(stubPath, 'utf8')
  let restored = false
  const restore = (): void => {
    if (restored) return
    restored = true
    try {
      writeFileSync(stubPath, originalStub)
    } catch (error) {
      console.error('Failed to restore tree-sitter-wasm-bytes stub:', error)
    }
  }

  const sourceWasm = findWebTreeSitterWasm()
  const wasmBytes = readFileSync(sourceWasm)
  const fullBase64 = wasmBytes.toString('base64')

  // ~1KB per chunk: well under any plausible minifier-dropped-literal
  // threshold, and small enough that even a heavy-handed inliner would
  // emit them as runtime references rather than evaluating the whole
  // .join() at compile time. Keeps total chunk count manageable too
  // (~270 chunks for a 205KB wasm).
  const CHUNK_SIZE = 1024
  const chunks: string[] = []
  for (let i = 0; i < fullBase64.length; i += CHUNK_SIZE) {
    chunks.push(fullBase64.slice(i, i + CHUNK_SIZE))
  }

  const generated =
    `// AUTO-GENERATED by cli/scripts/build-binary.ts during \`bun build --compile\`.\n` +
    `// Restored to an empty function after the build finishes — do not commit a\n` +
    `// non-empty body here.\n` +
    `export function getTreeSitterWasmChunks(): string[] {\n` +
    `  return [\n` +
    chunks.map((c) => `    ${JSON.stringify(c)},`).join('\n') +
    `\n  ]\n` +
    `}\n`

  writeFileSync(stubPath, generated)
  // Re-read what we just wrote so we can fail loudly if the OS buffered
  // the write. On Windows, NTFS writes can lag, and bun --compile would
  // then read the stale stub. Verifying here means the build fails
  // *during embed* instead of producing a broken binary that surprises
  // us later.
  const onDisk = readFileSync(stubPath, 'utf8')
  if (!onDisk.includes(chunks[0]!)) {
    throw new Error(
      `Embed wrote ${chunks.length} chunks but re-read of ${stubPath} ` +
        `does not contain chunk[0]. File on disk: ${onDisk.slice(0, 200)}…`,
    )
  }
  logAlways(
    `Embedded tree-sitter.wasm from ${sourceWasm} (${wasmBytes.length} bytes → ${chunks.length} chunks of ~${CHUNK_SIZE} chars).`,
  )

  // Pull a few sample chunks from the start, middle, and end for the
  // post-build verification scan. If any one is missing in the compiled
  // binary, something dropped or transformed the literals.
  const samples = [
    chunks[0],
    chunks[Math.floor(chunks.length / 2)],
    chunks[chunks.length - 1],
  ].filter((c): c is string => Boolean(c))

  return { restore, sampleChunks: samples }
}

/**
 * Sanity-check the compiled binary actually contains all the chunked
 * base64 we just embedded. We pass in a few sample chunks from the
 * start / middle / end of the array; each must appear in the binary.
 * If any one is missing, the bundler dropped or inlined-away part of
 * the literal table, and the runtime decode would produce garbage.
 */
function verifyTreeSitterWasmEmbedded(
  outputFile: string,
  sampleChunks: string[],
): void {
  if (sampleChunks.length === 0) {
    throw new Error('verifyTreeSitterWasmEmbedded called with no sample chunks')
  }
  const binary = readFileSync(outputFile)
  for (const chunk of sampleChunks) {
    const needle = Buffer.from(chunk, 'utf8')
    const idx = binary.indexOf(needle)
    if (idx === -1) {
      throw new Error(
        `Embedded tree-sitter wasm chunk not found in ${outputFile}.\n` +
          `Missing chunk (first 80 chars): ${chunk.slice(0, 80)}…\n` +
          `Either the \`tree-sitter-wasm-bytes.ts\` literals were tree-shaken,\n` +
          `the minifier transformed them away, or the pre-init's import wasn't\n` +
          `actually consumed. The runtime tree-sitter init would fail with\n` +
          `"Internal error: tree-sitter.wasm not found".`,
      )
    }
  }
  logAlways(
    `Verified ${sampleChunks.length} embedded base64 chunks in compiled binary.`,
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
