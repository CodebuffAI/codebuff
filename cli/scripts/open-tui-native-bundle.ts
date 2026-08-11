import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, join } from 'path'

const RECEIPT_FILE = '.freebuff-native-bundle.json'

type CompleteBundle = {
  version: string
  files: Record<string, Buffer>
}

export type OpenTuiNativeTarget = {
  platform: NodeJS.Platform
  arch: string
  /**
   * Which libc the native package is built against. OpenTUI publishes the
   * glibc build under the plain `core-<platform>-<arch>` name and the musl one
   * under a `-musl` suffix; every other difference (file layout, os/cpu
   * metadata) is identical between them. Omitted means glibc, which is also
   * the only shape Windows and macOS have.
   */
  libc?: 'musl'
}

type EnsureOpenTuiNativeBundleOptions = {
  packageDir: string
  version: string
  targetInfo: OpenTuiNativeTarget
  installBundle: (stagingRoot: string) => void
  renameDirectory?: (source: string, destination: string) => void
  removeDirectory?: (directory: string) => void
}

export function ensureOpenTuiNativeBundle({
  packageDir,
  version,
  targetInfo,
  installBundle,
  renameDirectory = renameSync,
  removeDirectory = removeDirectorySync,
}: EnsureOpenTuiNativeBundleOptions): 'installed' | 'reused' {
  const previousDir = `${packageDir}.previous`
  recoverInterruptedReplacement(
    packageDir,
    previousDir,
    targetInfo,
    renameDirectory,
    removeDirectory,
  )

  if (getValidBundleVersion(packageDir, targetInfo) === version) {
    return 'reused'
  }

  const packagesDir = dirname(packageDir)
  mkdirSync(packagesDir, { recursive: true })
  const stagingRoot = mkdtempSync(
    join(packagesDir, `.${basename(packageDir)}-install-`),
  )

  try {
    // Keep Bun from treating this directory as part of the parent monorepo and
    // hoisting the staged package into the live workspace.
    writeFileSync(join(stagingRoot, 'package.json'), '{"private":true}')
    installBundle(stagingRoot)

    const stagedPackageDir = join(
      stagingRoot,
      'node_modules',
      '@opentui',
      basename(packageDir),
    )
    sealOpenTuiNativeBundle(stagedPackageDir, version, targetInfo)

    return replaceBundle({
      stagedPackageDir,
      packageDir,
      previousDir,
      version,
      targetInfo,
      renameDirectory,
      removeDirectory,
    })
  } finally {
    removeBestEffort(stagingRoot, removeDirectory)
  }
}

function recoverInterruptedReplacement(
  packageDir: string,
  previousDir: string,
  targetInfo: OpenTuiNativeTarget,
  renameDirectory: (source: string, destination: string) => void,
  removeDirectory: (directory: string) => void,
): void {
  if (!existsSync(previousDir)) return

  // A complete destination means the swap finished before interruption.
  if (getValidBundleVersion(packageDir, targetInfo) !== null) {
    removeBestEffort(previousDir, removeDirectory)
    return
  }

  // Otherwise restore the last complete bundle before trying another install.
  if (readCompleteBundle(previousDir, targetInfo) !== null) {
    removeDirectory(packageDir)
    renameDirectory(previousDir, packageDir)
    return
  }

  removeBestEffort(previousDir, removeDirectory)
}

function replaceBundle({
  stagedPackageDir,
  packageDir,
  previousDir,
  version,
  targetInfo,
  renameDirectory,
  removeDirectory,
}: {
  stagedPackageDir: string
  packageDir: string
  previousDir: string
  version: string
  targetInfo: OpenTuiNativeTarget
  renameDirectory: (source: string, destination: string) => void
  removeDirectory: (directory: string) => void
}): 'installed' | 'reused' {
  let previousMoved = false

  try {
    if (existsSync(packageDir)) {
      if (readCompleteBundle(packageDir, targetInfo) !== null) {
        renameDirectory(packageDir, previousDir)
        previousMoved = true
      } else {
        removeDirectory(packageDir)
      }
    }

    renameDirectory(stagedPackageDir, packageDir)
    removeBestEffort(previousDir, removeDirectory)
    return 'installed'
  } catch (installError) {
    // A concurrent installer may have won the destination race.
    if (getValidBundleVersion(packageDir, targetInfo) === version) {
      removeBestEffort(previousDir, removeDirectory)
      return 'reused'
    }

    if (previousMoved && existsSync(previousDir)) {
      removeDirectory(packageDir)
      try {
        renameDirectory(previousDir, packageDir)
      } catch (restoreError) {
        throw new AggregateError(
          [installError, restoreError],
          `Failed to install the native bundle and restore the previous bundle; recovery copy remains at ${previousDir}`,
        )
      }
    }
    throw installError
  }
}

function removeDirectorySync(directory: string): void {
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  })
}

function removeBestEffort(
  directory: string,
  removeDirectory: (directory: string) => void,
): void {
  try {
    removeDirectory(directory)
  } catch {
    // Cleanup must not invalidate an already complete bundle. A later build can
    // proceed while the orphaned staging or recovery directory is removed later.
  }
}

export function getValidBundleVersion(
  packageDir: string,
  targetInfo: OpenTuiNativeTarget,
): string | null {
  const bundle = readCompleteBundle(packageDir, targetInfo)
  if (!bundle) return null

  try {
    const receipt = JSON.parse(
      readFileSync(join(packageDir, RECEIPT_FILE), 'utf8'),
    ) as {
      version?: unknown
      files?: unknown
    }
    if (
      receipt.version !== bundle.version ||
      !receipt.files ||
      typeof receipt.files !== 'object'
    ) {
      return null
    }

    const hashes = receipt.files as Record<string, unknown>
    return Object.entries(bundle.files).every(
      ([file, contents]) => hashes[file] === hash(contents),
    )
      ? bundle.version
      : null
  } catch {
    return null
  }
}

export function sealOpenTuiNativeBundle(
  packageDir: string,
  version: string,
  targetInfo: OpenTuiNativeTarget,
): void {
  const bundle = readCompleteBundle(packageDir, targetInfo)
  if (bundle?.version !== version) {
    throw new Error(
      `Installed ${getOpenTuiNativePackageName(targetInfo)}@${version} is incomplete or incompatible`,
    )
  }

  const files = Object.fromEntries(
    Object.entries(bundle.files).map(([file, contents]) => [
      file,
      hash(contents),
    ]),
  )
  writeFileSync(
    join(packageDir, RECEIPT_FILE),
    JSON.stringify({ version, files }),
  )
}

function readCompleteBundle(
  packageDir: string,
  targetInfo: OpenTuiNativeTarget,
): CompleteBundle | null {
  const nativeLibrary = getOpenTuiNativeLibrary(targetInfo.platform)
  if (!nativeLibrary) return null

  try {
    const fileNames = ['package.json', 'index.bun.js', nativeLibrary]
    const files = Object.fromEntries(
      fileNames.map((file) => [file, readFileSync(join(packageDir, file))]),
    )
    if (Object.values(files).some((contents) => contents.length === 0)) {
      return null
    }

    const packageJson = JSON.parse(files['package.json'].toString('utf8')) as {
      name?: unknown
      version?: unknown
      os?: unknown
      cpu?: unknown
    }
    return packageJson.name === getOpenTuiNativePackageName(targetInfo) &&
      typeof packageJson.version === 'string' &&
      Array.isArray(packageJson.os) &&
      packageJson.os.includes(targetInfo.platform) &&
      Array.isArray(packageJson.cpu) &&
      packageJson.cpu.includes(targetInfo.arch)
      ? { version: packageJson.version, files }
      : null
  } catch {
    return null
  }
}

function hash(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex')
}

function getOpenTuiNativePackageName(targetInfo: OpenTuiNativeTarget): string {
  const suffix = targetInfo.libc === 'musl' ? '-musl' : ''
  return `@opentui/core-${targetInfo.platform}-${targetInfo.arch}${suffix}`
}

function getOpenTuiNativeLibrary(platform: NodeJS.Platform): string | null {
  switch (platform) {
    case 'win32':
      return 'opentui.dll'
    case 'darwin':
      return 'libopentui.dylib'
    case 'linux':
      return 'libopentui.so'
    default:
      return null
  }
}
