import fs from 'fs'
import path from 'path'

import micromatch from 'micromatch'

import {
  loadProviderConfigSync,
  mergeFileChangeHooks,
} from '../provider-config'
import { parseLanguageDiagnostics } from './language-diagnostics'
import { runTerminalCommand } from './run-terminal-command'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

export type FileChangeHook = {
  name?: string
  command: string
  /** Optional glob; the hook runs only when a changed file matches it. */
  filePattern?: string
  /** Optional per-hook override of the default 180s hook timeout, in seconds. */
  timeoutSeconds?: number
  /** Run the command once per matching changed file instead of project-wide. */
  runPerFile?: boolean
}

const HOOK_TIMEOUT_SECONDS = 180
const MAX_HOOK_OUTPUT_CHARS = 6000
const MAX_MANIFEST_BYTES = 512_000
const MAX_PROJECT_SCAN_ENTRIES = 2_000
const MAX_PROJECT_SCAN_DEPTH = 5
const MAX_PER_FILE_HOOK_FILES = 50
const PROJECT_SCAN_EXCLUDED_DIRS = new Set([
  '.git',
  '.gradle',
  '.godot',
  '.idea',
  '.openbuff',
  '.venv',
  'bin',
  'node_modules',
  'build',
  'dist',
  'obj',
  'target',
  'vendor',
])

type PackageJson = {
  scripts?: Record<string, unknown>
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  packageManager?: unknown
}

type ComposerJson = {
  scripts?: Record<string, unknown>
  require?: Record<string, unknown>
  'require-dev'?: Record<string, unknown>
}

type ManifestSnapshot = {
  existing: Set<string>
  contents: Map<string, string>
  dotnetTarget?: string
}

const KNOWN_PROJECT_PATHS = [
  '.rubocop.yml',
  '.swift-format',
  'bun.lock',
  'bun.lockb',
  'build.gradle',
  'build.gradle.kts',
  'build/CMakeCache.txt',
  'build/meson-private/coredata.dat',
  'build.ninja',
  'Cargo.toml',
  'CMakeLists.txt',
  'CMakePresets.json',
  'composer.json',
  'Gemfile',
  'go.mod',
  'gradlew',
  'gradlew.bat',
  'Makefile',
  'mvnw',
  'mvnw.cmd',
  'package-lock.json',
  'package.json',
  'Package.swift',
  'phpstan.neon',
  'phpstan.neon.dist',
  'pnpm-lock.yaml',
  'pom.xml',
  'project.godot',
  'pyproject.toml',
  'pyrightconfig.json',
  'requirements-dev.txt',
  'requirements.txt',
  'settings.gradle',
  'settings.gradle.kts',
  'tox.ini',
  'yarn.lock',
] as const

/**
 * Hooks that should run for this set of changed files: those with no
 * filePattern (always run) or whose glob matches at least one changed file.
 */
export function selectMatchingHooks(
  hooks: FileChangeHook[],
  files: string[],
): FileChangeHook[] {
  return hooks.filter((hook) => {
    if (!hook.filePattern) return true
    if (files.length === 0) return false
    return micromatch.some(files, hook.filePattern)
  })
}

export function inferFileChangeHooks(cwd: string): FileChangeHook[] {
  return inferHooksFromSnapshot(collectManifestSnapshot(cwd))
}

export async function inferFileChangeHooksFromFileSystem(
  cwd: string,
  fileSystem: CodebuffFileSystem,
): Promise<FileChangeHook[]> {
  return inferHooksFromSnapshot(
    await collectManifestSnapshotFromFileSystem(cwd, fileSystem),
  )
}

function inferHooksFromSnapshot(snapshot: ManifestSnapshot): FileChangeHook[] {
  const hooks: FileChangeHook[] = []
  const packageJson = parseJson<PackageJson>(
    snapshot.contents.get('package.json'),
  )
  if (packageJson) {
    hooks.push(
      ...inferPackageJsonHooks(packageJson, detectPackageRunner(snapshot)),
    )
  }

  if (snapshot.existing.has('go.mod')) {
    hooks.push(
      {
        name: 'gofmt',
        command: `gofmt -l . | awk 'NF { found=1 } END { exit found ? 1 : 0 }'`,
        filePattern: '**/*.go',
      },
      { name: 'go vet', command: 'go vet ./...', filePattern: '**/*.go' },
      { name: 'go test', command: 'go test ./...', filePattern: '**/*.go' },
    )
  }

  if (snapshot.dotnetTarget) {
    const target = shellQuote(snapshot.dotnetTarget)
    hooks.push(
      {
        name: 'dotnet format',
        command: `dotnet format ${target} --verify-no-changes --no-restore`,
        filePattern: '**/*.{cs,csproj,sln}',
      },
      {
        name: 'dotnet build',
        command: `dotnet build ${target} --nologo --no-restore`,
        filePattern: '**/*.{cs,csproj,sln}',
      },
      {
        name: 'dotnet test',
        command: `dotnet test ${target} --nologo --no-restore`,
        filePattern: '**/*.{cs,csproj,sln}',
      },
    )
  }

  if (snapshot.existing.has('Cargo.toml')) {
    hooks.push(
      {
        name: 'cargo fmt',
        command: 'cargo fmt --check',
        filePattern: '**/*.rs',
      },
      {
        name: 'cargo clippy',
        command: 'cargo clippy --all-targets --all-features -- -D warnings',
        filePattern: '**/*.rs',
      },
      {
        name: 'cargo test',
        command: 'cargo test --workspace --all-targets',
        filePattern: '**/*.rs',
      },
    )
  }

  hooks.push(...inferPythonHooks(snapshot))
  hooks.push(...inferRubyHooks(snapshot))

  if (snapshot.existing.has('Package.swift')) {
    if (snapshot.existing.has('.swift-format')) {
      hooks.push({
        name: 'swift-format',
        command: 'swift-format lint --recursive .',
        filePattern: '**/*.swift',
      })
    }
    hooks.push({
      name: 'swift build',
      command: 'swift build --jobs 2',
      filePattern: '**/*.{swift,xcodeproj}',
    })
    hooks.push({
      name: 'swift test',
      command: 'swift test --parallel',
      filePattern: '**/*.{swift,xcodeproj}',
    })
  }

  hooks.push(...inferJvmHooks(snapshot))
  hooks.push(...inferPhpHooks(snapshot))
  hooks.push(...inferCppHooks(snapshot))

  if (snapshot.existing.has('project.godot')) {
    hooks.push({
      name: 'godot validation',
      command: 'godot --headless --editor --quit --path .',
      filePattern: '**/*.{gd,gdshader,tscn,tres,godot}',
    })
  }

  return hooks
}

function inferPackageJsonHooks(
  packageJson: PackageJson,
  packageRunner: string,
): FileChangeHook[] {
  const hooks: FileChangeHook[] = []
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  }
  const lintScript = findScript(packageJson.scripts, ['lint'])
  const typecheckScript = findScript(packageJson.scripts, [
    'typecheck',
    'type-check',
    'check:types',
  ])

  if (lintScript) {
    hooks.push({
      name: `script:${lintScript}`,
      command: `${packageRunner} run ${shellQuote(lintScript)}`,
      filePattern: '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
    })
  } else if ('eslint' in dependencies) {
    hooks.push({
      name: 'lint',
      command: localPackageExecutableCommand(packageRunner, 'eslint', '.'),
      filePattern: '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
    })
  }

  if (typecheckScript) {
    hooks.push({
      name: `script:${typecheckScript}`,
      command: `${packageRunner} run ${shellQuote(typecheckScript)}`,
      filePattern: '**/*.{ts,tsx,mts,cts}',
    })
  } else if ('typescript' in dependencies) {
    hooks.push({
      name: 'typecheck',
      command: localPackageExecutableCommand(packageRunner, 'tsc', '--noEmit'),
      filePattern: '**/*.{ts,tsx,mts,cts}',
    })
  }

  return hooks
}

function localPackageExecutableCommand(
  packageRunner: string,
  executable: string,
  args: string,
): string {
  switch (packageRunner) {
    case 'bun':
      return `bunx --no-install ${executable} ${args}`
    case 'pnpm':
      return `pnpm exec ${executable} ${args}`
    case 'yarn':
      return `yarn exec ${executable} ${args}`
    default:
      return `npx --no-install ${executable} ${args}`
  }
}

function inferPythonHooks(snapshot: ManifestSnapshot): FileChangeHook[] {
  const projectConfig = [
    snapshot.contents.get('pyproject.toml') ?? '',
    snapshot.contents.get('requirements.txt') ?? '',
    snapshot.contents.get('requirements-dev.txt') ?? '',
    snapshot.contents.get('tox.ini') ?? '',
  ]
    .join('\n')
    .toLowerCase()
  if (!projectConfig && !snapshot.existing.has('pyrightconfig.json')) return []

  const hooks: FileChangeHook[] = []
  if (/\bruff\b|\[tool\.ruff\]/.test(projectConfig)) {
    hooks.push({
      name: 'ruff',
      command: 'ruff check .',
      filePattern: '**/*.py',
    })
  }
  if (
    snapshot.existing.has('pyrightconfig.json') ||
    /\bpyright\b/.test(projectConfig)
  ) {
    hooks.push({ name: 'pyright', command: 'pyright', filePattern: '**/*.py' })
  } else if (/\bmypy\b|\[tool\.mypy\]/.test(projectConfig)) {
    hooks.push({ name: 'mypy', command: 'mypy .', filePattern: '**/*.py' })
  }
  if (/\bpytest\b|\[tool\.pytest/.test(projectConfig)) {
    hooks.push({
      name: 'pytest',
      command: 'python -m pytest',
      filePattern: '**/*.py',
    })
  }
  return hooks
}

function inferRubyHooks(snapshot: ManifestSnapshot): FileChangeHook[] {
  const gemfile = snapshot.contents.get('Gemfile')?.toLowerCase() ?? ''
  const hooks: FileChangeHook[] = []
  if (snapshot.existing.has('.rubocop.yml') || /\brubocop\b/.test(gemfile)) {
    hooks.push({
      name: 'rubocop',
      command: snapshot.existing.has('Gemfile')
        ? 'bundle exec rubocop'
        : 'rubocop',
      filePattern: '**/*.rb',
    })
  }
  if (/\brspec\b/.test(gemfile)) {
    hooks.push({
      name: 'rspec',
      command: 'bundle exec rspec',
      filePattern: '**/*.rb',
    })
  }
  return hooks
}

function inferJvmHooks(snapshot: ManifestSnapshot): FileChangeHook[] {
  const hasGradle =
    snapshot.existing.has('build.gradle') ||
    snapshot.existing.has('build.gradle.kts') ||
    snapshot.existing.has('settings.gradle') ||
    snapshot.existing.has('settings.gradle.kts')
  if (hasGradle) {
    const gradle = snapshot.existing.has('gradlew')
      ? './gradlew'
      : snapshot.existing.has('gradlew.bat')
        ? './gradlew.bat'
        : 'gradle'
    return [
      {
        name: 'gradle check',
        command: `${gradle} --no-daemon --console=plain --max-workers=2 check`,
        filePattern: '**/*.{java,kt,kts,gradle}',
      },
    ]
  }
  if (!snapshot.existing.has('pom.xml')) return []
  const maven = snapshot.existing.has('mvnw')
    ? './mvnw'
    : snapshot.existing.has('mvnw.cmd')
      ? './mvnw.cmd'
      : 'mvn'
  return [
    {
      name: 'maven test',
      command: `${maven} -q test`,
      filePattern: '**/*.{java,kt,kts,xml}',
    },
  ]
}

function inferPhpHooks(snapshot: ManifestSnapshot): FileChangeHook[] {
  const composer = parseJson<ComposerJson>(
    snapshot.contents.get('composer.json'),
  )
  if (!composer) return []
  const hooks: FileChangeHook[] = [
    {
      name: 'composer validate',
      command: 'composer validate --no-check-publish --no-interaction',
      filePattern: '**/composer.{json,lock}',
    },
  ]
  const script = findScript(composer.scripts, [
    'check',
    'lint',
    'analyse',
    'analyze',
    'static-analysis',
    'test',
  ])
  if (script) {
    hooks.push({
      name: `composer:${script}`,
      command: `composer run-script --no-interaction ${shellQuote(script)}`,
      filePattern: '**/*.php',
    })
    return hooks
  }

  const dependencies = {
    ...(composer.require ?? {}),
    ...(composer['require-dev'] ?? {}),
  }
  if (
    'phpstan/phpstan' in dependencies ||
    snapshot.existing.has('phpstan.neon') ||
    snapshot.existing.has('phpstan.neon.dist')
  ) {
    hooks.push({
      name: 'phpstan',
      command:
        'vendor/bin/phpstan analyse --error-format=raw --no-progress --memory-limit=1G',
      filePattern: '**/*.php',
    })
  } else if ('vimeo/psalm' in dependencies) {
    hooks.push({
      name: 'psalm',
      command: 'vendor/bin/psalm --no-progress --threads=2',
      filePattern: '**/*.php',
    })
  } else {
    hooks.push({
      name: 'php syntax',
      command: 'php -l',
      filePattern: '**/*.php',
      runPerFile: true,
    })
  }
  return hooks
}

function inferCppHooks(snapshot: ManifestSnapshot): FileChangeHook[] {
  const pattern = '**/*.{c,cc,cpp,cxx,h,hh,hpp,hxx}'
  const presets = parseJson<{
    buildPresets?: Array<{ name?: unknown; hidden?: unknown }>
  }>(snapshot.contents.get('CMakePresets.json'))
  const preset = presets?.buildPresets?.find(
    (item) =>
      item.hidden !== true &&
      typeof item.name === 'string' &&
      /^[A-Za-z0-9_.-]+$/.test(item.name),
  )?.name
  if (typeof preset === 'string') {
    return [
      {
        name: 'cmake build',
        command: `cmake --build --preset ${shellQuote(preset)} --parallel 2`,
        filePattern: pattern,
      },
    ]
  }
  if (snapshot.existing.has('build/CMakeCache.txt')) {
    return [
      {
        name: 'cmake build',
        command: 'cmake --build build --parallel 2',
        filePattern: pattern,
      },
      {
        name: 'ctest',
        command: 'ctest --test-dir build --output-on-failure -j 2',
        filePattern: pattern,
      },
    ]
  }
  if (snapshot.existing.has('build/meson-private/coredata.dat')) {
    return [
      {
        name: 'meson compile',
        command: 'meson compile -C build -j 2',
        filePattern: pattern,
      },
    ]
  }
  if (snapshot.existing.has('build.ninja')) {
    return [{ name: 'ninja', command: 'ninja -j 2', filePattern: pattern }]
  }
  const makefile = snapshot.contents.get('Makefile') ?? ''
  const target = ['check', 'test', 'lint'].find((name) =>
    new RegExp(`^${name}\\s*:`, 'm').test(makefile),
  )
  return target
    ? [
        {
          name: `make ${target}`,
          command: `make -j 2 ${target}`,
          filePattern: pattern,
        },
      ]
    : []
}

function collectManifestSnapshot(cwd: string): ManifestSnapshot {
  const existing = new Set<string>()
  const contents = new Map<string, string>()
  for (const relativePath of KNOWN_PROJECT_PATHS) {
    const filePath = path.join(cwd, relativePath)
    try {
      const stats = fs.statSync(filePath)
      existing.add(relativePath)
      if (stats.isFile() && stats.size <= MAX_MANIFEST_BYTES) {
        contents.set(relativePath, fs.readFileSync(filePath, 'utf8'))
      }
    } catch {
      // Missing or unreadable project metadata is not an inference failure.
    }
  }
  return {
    existing,
    contents,
    dotnetTarget: findDotnetTarget(cwd),
  }
}

async function collectManifestSnapshotFromFileSystem(
  cwd: string,
  fileSystem: CodebuffFileSystem,
): Promise<ManifestSnapshot> {
  const existing = new Set<string>()
  const contents = new Map<string, string>()
  await Promise.all(
    KNOWN_PROJECT_PATHS.map(async (relativePath) => {
      const filePath = path.join(cwd, relativePath)
      try {
        const stats = await fileSystem.stat(filePath)
        existing.add(relativePath)
        if (stats.isFile() && stats.size <= MAX_MANIFEST_BYTES) {
          const value = await fileSystem.readFile(filePath, 'utf8')
          contents.set(relativePath, String(value))
        }
      } catch {
        // Missing or unreadable project metadata is not an inference failure.
      }
    }),
  )
  return {
    existing,
    contents,
    dotnetTarget: await findDotnetTargetInFileSystem(cwd, fileSystem),
  }
}

function findDotnetTarget(cwd: string): string | undefined {
  const candidates: string[] = []
  const budget = { remaining: MAX_PROJECT_SCAN_ENTRIES }
  const visit = (directory: string, depth: number): void => {
    if (depth > MAX_PROJECT_SCAN_DEPTH || budget.remaining <= 0) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (--budget.remaining < 0) return
      const entryPath = path.join(directory, entry.name)
      if (entry.isFile() && /\.(?:sln|csproj)$/.test(entry.name)) {
        candidates.push(toPosixPath(path.relative(cwd, entryPath)))
      } else if (
        entry.isDirectory() &&
        !PROJECT_SCAN_EXCLUDED_DIRS.has(entry.name)
      ) {
        visit(entryPath, depth + 1)
      }
    }
  }
  visit(cwd, 0)
  return preferDotnetTarget(candidates)
}

async function findDotnetTargetInFileSystem(
  cwd: string,
  fileSystem: CodebuffFileSystem,
): Promise<string | undefined> {
  const candidates: string[] = []
  const budget = { remaining: MAX_PROJECT_SCAN_ENTRIES }
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_PROJECT_SCAN_DEPTH || budget.remaining <= 0) return
    let entries: string[]
    try {
      entries = ((await fileSystem.readdir(directory)) as string[]).sort()
    } catch {
      return
    }
    for (const entry of entries) {
      if (--budget.remaining < 0) return
      const entryPath = path.join(directory, entry)
      let stats: Awaited<ReturnType<CodebuffFileSystem['stat']>>
      try {
        stats = await fileSystem.stat(entryPath)
      } catch {
        continue
      }
      if (stats.isFile() && /\.(?:sln|csproj)$/.test(entry)) {
        candidates.push(toPosixPath(path.relative(cwd, entryPath)))
      } else if (
        stats.isDirectory() &&
        !PROJECT_SCAN_EXCLUDED_DIRS.has(entry)
      ) {
        await visit(entryPath, depth + 1)
      }
    }
  }
  await visit(cwd, 0)
  return preferDotnetTarget(candidates)
}

function preferDotnetTarget(candidates: string[]): string | undefined {
  return (
    candidates.find((candidate) => candidate.endsWith('.sln')) ??
    candidates.find((candidate) => candidate.endsWith('.csproj'))
  )
}

function detectPackageRunner(snapshot: ManifestSnapshot): string {
  const packageJson = parseJson<PackageJson>(
    snapshot.contents.get('package.json'),
  )
  if (typeof packageJson?.packageManager === 'string') {
    const manager = packageJson.packageManager.split('@')[0]
    if (['bun', 'npm', 'pnpm', 'yarn'].includes(manager)) return manager
  }
  if (snapshot.existing.has('bun.lock') || snapshot.existing.has('bun.lockb')) {
    return 'bun'
  }
  if (snapshot.existing.has('pnpm-lock.yaml')) return 'pnpm'
  if (snapshot.existing.has('yarn.lock')) return 'yarn'
  return 'npm'
}

function findScript(
  scripts: Record<string, unknown> | undefined,
  candidates: string[],
): string | undefined {
  return candidates.find(
    (candidate) =>
      typeof scripts?.[candidate] === 'string' &&
      (scripts[candidate] as string).trim().length > 0,
  )
}

function parseJson<T>(value: string | undefined): T | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as T
  } catch {
    return undefined
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/')
}

type RunCommand = typeof runTerminalCommand

/**
 * Run the configured file-change hooks (typecheck/lint/test) for a set of
 * changed files — the verification gate's executor. Returns one result per
 * hook (the terminal output plus a hookName), matching run_file_change_hooks'
 * output schema. `hooks` and `runCommand` are injectable for testing.
 */
export async function runFileChangeHooks(params: {
  files: string[]
  cwd: string
  env?: Record<string, string | undefined>
  hooks?: FileChangeHook[]
  runCommand?: RunCommand
  signal?: AbortSignal
  fileSystem?: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'run_file_change_hooks'>> {
  const { files, cwd, env } = params
  const hooks =
    params.hooks ??
    (await (async () => {
      const config = loadProviderConfigSync().config
      // Inference uses fixed validation commands selected from manifests; it
      // never executes repository package scripts unless explicitly configured.
      if (config.autoFileChangeHooks === false) return config.fileChangeHooks
      return mergeFileChangeHooks(
        params.fileSystem
          ? await inferFileChangeHooksFromFileSystem(cwd, params.fileSystem)
          : inferFileChangeHooks(cwd),
        config.fileChangeHooks,
      )
    })())
  const matching = selectMatchingHooks(hooks, files)
  if (hooks.length === 0) {
    return [
      {
        type: 'json',
        value: [
          {
            validationStatus: 'no_hooks_configured',
            message: 'No configured file-change hooks ran.',
            changedFiles: files,
          },
        ],
      },
    ] as CodebuffToolOutput<'run_file_change_hooks'>
  }
  if (matching.length === 0) {
    return [
      {
        type: 'json',
        value: [
          {
            validationStatus: 'hooks_skipped',
            message:
              'Configured file-change hooks were skipped because none matched the changed files.',
            configuredHookCount: hooks.length,
            changedFiles: files,
          },
        ],
      },
    ] as CodebuffToolOutput<'run_file_change_hooks'>
  }

  const run = params.runCommand ?? runTerminalCommand

  // Run matching hooks concurrently. `Promise.allSettled` guarantees every
  // hook runs regardless of others' rejections; results are mapped back into
  // `matching` order so callers see deterministic ordering.
  const settled = await Promise.allSettled(
    matching.map((hook) => {
      const hookName = hook.name ?? hook.command
      const hookCommand = buildHookCommand(hook, files, cwd)
      if ('errorMessage' in hookCommand) {
        return Promise.resolve({
          errorMessage: `Hook "${hookName}" was not run: ${hookCommand.errorMessage}`,
          hookName,
        })
      }
      return run({
        command: hookCommand.command,
        process_type: 'SYNC',
        cwd,
        projectRoot: cwd,
        timeout_seconds: hook.timeoutSeconds ?? HOOK_TIMEOUT_SECONDS,
        env,
        signal: params.signal,
      })
        .then((out) => {
          const first = Array.isArray(out) ? out[0] : undefined
          if (
            first &&
            first.type === 'json' &&
            first.value &&
            typeof first.value === 'object'
          ) {
            const value = first.value as Record<string, unknown>
            const stdout = typeof value.stdout === 'string' ? value.stdout : ''
            const stderr = typeof value.stderr === 'string' ? value.stderr : ''
            const diagnostics = parseLanguageDiagnostics({
              command: hookCommand.command,
              cwd,
              stdout,
              stderr,
            })
            return {
              ...value,
              stdout: truncateOutput(stdout),
              stderr: truncateOutput(stderr),
              hookName,
              ...(diagnostics.length > 0 && { diagnostics }),
            }
          }
          return { errorMessage: `Hook "${hookName}" produced no output.` }
        })
        .catch((err: unknown) => ({
          errorMessage: `Hook "${hookName}" failed to run: ${
            err instanceof Error ? err.message : String(err)
          }`,
        }))
    }),
  )

  const results: Array<Record<string, unknown>> = settled.map((s) =>
    s.status === 'fulfilled'
      ? (s.value as Record<string, unknown>)
      : {
          errorMessage: `Hook failed to run: ${
            s.reason instanceof Error ? s.reason.message : String(s.reason)
          }`,
        },
  )

  return [
    { type: 'json', value: results },
  ] as CodebuffToolOutput<'run_file_change_hooks'>
}

function buildHookCommand(
  hook: FileChangeHook,
  files: string[],
  cwd: string,
): { command: string } | { errorMessage: string } {
  if (!hook.runPerFile) return { command: hook.command }
  const matchingFiles = hook.filePattern
    ? micromatch(files, hook.filePattern)
    : files
  const safeFiles = matchingFiles.flatMap((file) => {
    const absolute = path.resolve(cwd, file)
    const relative = path.relative(cwd, absolute)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return []
    }
    return [toPosixPath(relative)]
  })
  if (safeFiles.length === 0) return { errorMessage: 'no safe files matched' }
  if (safeFiles.length > MAX_PER_FILE_HOOK_FILES) {
    return {
      errorMessage: `matched ${safeFiles.length} files, exceeding the ${MAX_PER_FILE_HOOK_FILES}-file safety limit`,
    }
  }
  return {
    command: safeFiles
      .map((file) => `${hook.command} ${shellQuote(file)}`)
      .join(' && '),
  }
}

function truncateOutput(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.length > MAX_HOOK_OUTPUT_CHARS
    ? value.slice(0, MAX_HOOK_OUTPUT_CHARS) + '\n…[truncated]'
    : value
}
