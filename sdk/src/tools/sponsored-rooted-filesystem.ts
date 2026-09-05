import { getSystemProcessEnv } from '../env'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

import { containSponsoredPath } from './sponsored-sandbox'
import type { TerminalCommandBroker } from './run-terminal-command'

type SponsoredFsVerb = 'read files' | 'write'

export function sponsoredStatCommand(platform: NodeJS.Platform): string {
  return platform === 'darwin'
    ? `/usr/bin/stat -f '%z%n%a%n%HT' -- "$1"`
    : `/usr/bin/stat --printf '%s\\n%X\\n%F\\n' -- "$1"`
}

function errorCode(error: unknown): string | null {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

function rootedPath(
  workspaceRoot: string,
  requested: unknown,
  verb: SponsoredFsVerb,
  allowMissing: boolean,
): string {
  if (typeof requested !== 'string') {
    throw new Error(`A sponsored run must name the path it wants to ${verb}.`)
  }
  const root = fs.realpathSync(path.resolve(workspaceRoot))
  const resolved = containSponsoredPath(root, requested, verb)
  const relative = path.relative(root, resolved)
  let current = root

  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    try {
      const stat = fs.lstatSync(current)
      if (stat.isSymbolicLink()) {
        throw new Error(
          `A sponsored run may not ${verb} through a symlink in its worktree.`,
        )
      }
    } catch (error) {
      if (errorCode(error) === 'ENOENT' && allowMissing) break
      throw error
    }
  }
  return resolved
}

/**
 * A filesystem capability rooted at one sponsored worktree.
 *
 * Every operation resolves at use time and refuses all symlink components.
 * Reads, metadata, enumeration and mutations execute inside the sponsored OS
 * broker after walking and pinning the destination's parent as the helper's
 * cwd. An ancestor replaced after validation cannot redirect the operation;
 * a leaf replaced after its no-symlink guard remains bounded by the kernel
 * sandbox. Write content is staged only in the private runtime directory.
 *
 * Directory enumeration also runs after the broker helper has walked and
 * pinned the destination as its cwd. Node exposes no public
 * openat/readdir-by-directory-fd API, so the host never enumerates a checked
 * directory again by its mutable pathname. The brokered relative operation is
 * the directory-fd boundary Node itself cannot express.
 */
export function createSponsoredRootedFileSystem(options: {
  workspaceRoot: string
  runtimeDir: string
  processBroker: TerminalCommandBroker
}): CodebuffFileSystem {
  const { workspaceRoot, runtimeDir, processBroker } = options
  const canonicalRoot = fs.realpathSync(path.resolve(workspaceRoot))
  fs.mkdirSync(runtimeDir, { recursive: true })
  if (fs.lstatSync(runtimeDir).isSymbolicLink()) {
    throw new Error('A sponsored run requires a real runtime directory.')
  }
  const canonicalRuntimeDir = fs.realpathSync(runtimeDir)

  const collect = async (
    stream: NodeJS.ReadableStream,
    limit: number,
  ): Promise<Buffer> => {
    const chunks: Buffer[] = []
    let length = 0
    for await (const value of stream) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      if (length + chunk.length > limit) {
        throw new Error('Sponsored filesystem helper output was too large.')
      }
      chunks.push(chunk)
      length += chunk.length
    }
    return Buffer.concat(chunks, length)
  }

  const runHelper = async (
    script: string,
    args: string[],
    outputLimit = 8 * 1024 * 1024,
  ): Promise<Buffer> => {
    const child = processBroker.start({
      executable: '/bin/sh',
      args: ['-c', `set -e\n${script}`, 'sponsored-fs', ...args],
      cwd: workspaceRoot,
      env: getSystemProcessEnv(),
    })
    const [exitCode, stdout, stderrBuffer] = await Promise.all([
      child.completion,
      collect(child.stdout, outputLimit),
      collect(child.stderr, 4_000),
    ])
    if (exitCode !== 0) {
      throw new Error(
        stderrBuffer.toString().trim() ||
          `Sponsored filesystem helper exited with code ${exitCode}.`,
      )
    }
    return stdout
  }

  const runMutation = async (script: string, args: string[]): Promise<void> => {
    await runHelper(script, args)
  }

  const segments = (resolved: string): string[] =>
    path.relative(canonicalRoot, resolved).split(path.sep).filter(Boolean)

  const walkDirectories = [
    'root=$1',
    'create=$2',
    'count=$3',
    'shift 3',
    'cd -P -- "$root" || exit 73',
    'case "$PWD/" in "$root/"*) ;; *) exit 73 ;; esac',
    'while [ "$count" -gt 0 ]; do',
    '  component=$1',
    '  shift',
    '  test ! -L "$component" || exit 73',
    '  if [ "$create" = 1 ] && [ ! -d "$component" ]; then mkdir -- "$component" || exit 74; fi',
    '  test -d "$component" || exit 73',
    '  cd -P -- "$component" || exit 73',
    '  case "$PWD/" in "$root/"*) ;; *) exit 73 ;; esac',
    '  count=$((count - 1))',
    'done',
  ].join('\n')

  return {
    mkdir: async (
      requested: string,
      options?: fs.MakeDirectoryOptions & { recursive?: boolean },
    ) => {
      const resolved = rootedPath(workspaceRoot, requested, 'write', true)
      if (options?.recursive === false) {
        const parts = segments(resolved)
        const leaf = parts.pop()
        if (!leaf) return undefined
        await runMutation(
          `${walkDirectories}\ntest ! -L "$1" || exit 73\nmkdir -- "$1" || exit 74`,
          [canonicalRoot, '0', String(parts.length), ...parts, leaf],
        )
      } else {
        const parts = segments(resolved)
        await runMutation(walkDirectories, [
          canonicalRoot,
          '1',
          String(parts.length),
          ...parts,
        ])
      }
      return undefined
    },
    readdir: async (requested: string, options?: unknown) => {
      const resolved = rootedPath(workspaceRoot, requested, 'read files', false)
      const parts = segments(resolved)
      const output = await runHelper(
        `${walkDirectories}
for entry in ./* ./.[!.]* ./..?*; do
  if [ ! -e "$entry" ] && [ ! -L "$entry" ]; then continue; fi
  if [ -L "$entry" ]; then kind=l
  elif [ -d "$entry" ]; then kind=d
  elif [ -f "$entry" ]; then kind=f
  else kind=o
  fi
  printf '%s\\000%s\\000' "$kind" "\${entry#./}" || exit 74
done`,
        [canonicalRoot, '0', String(parts.length), ...parts],
      )
      const fields = output.length
        ? output
            .subarray(0, output.length - 1)
            .toString()
            .split('\0')
        : []
      const entries = []
      for (let index = 0; index < fields.length; index += 2) {
        const kind = fields[index]
        const name = fields[index + 1]
        if (!kind || name === undefined) {
          throw new Error(
            'Sponsored filesystem helper returned an invalid directory listing.',
          )
        }
        entries.push({
          name,
          parentPath: resolved,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isDirectory: () => kind === 'd',
          isFIFO: () => false,
          isFile: () => kind === 'f',
          isSocket: () => false,
          isSymbolicLink: () => kind === 'l',
        })
      }
      const withFileTypes =
        options !== null &&
        typeof options === 'object' &&
        'withFileTypes' in options &&
        options.withFileTypes === true
      return (
        withFileTypes ? entries : entries.map((entry) => entry.name)
      ) as never
    },
    readFile: async (requested: string, options?: unknown) => {
      const resolved = rootedPath(workspaceRoot, requested, 'read files', false)
      const parts = segments(resolved)
      const leaf = parts.pop() ?? '.'
      const output = await runHelper(
        `${walkDirectories}
test ! -L "$1" || exit 73
exec /bin/cat -- "$1"`,
        [canonicalRoot, '0', String(parts.length), ...parts, leaf],
        16 * 1024 * 1024,
      )
      const encoding =
        typeof options === 'string'
          ? options
          : options && typeof options === 'object' && 'encoding' in options
            ? options.encoding
            : null
      return encoding ? output.toString(encoding as BufferEncoding) : output
    },
    stat: async (requested: string) => {
      const resolved = rootedPath(workspaceRoot, requested, 'read files', false)
      const parts = segments(resolved)
      const leaf = parts.pop() ?? '.'
      const statCommand = sponsoredStatCommand(process.platform)
      const output = await runHelper(
        `${walkDirectories}
test ! -L "$1" || exit 73
${statCommand} || exit 74`,
        [canonicalRoot, '0', String(parts.length), ...parts, leaf],
      )
      const [sizeText, atimeText, ...kindParts] = output
        .toString()
        .trimEnd()
        .split('\n')
      const size = Number(sizeText)
      const atimeMs = Number(atimeText) * 1_000
      const kind = kindParts.join('\n').toLowerCase()
      if (!Number.isFinite(size) || !Number.isFinite(atimeMs) || !kind) {
        throw new Error(
          'Sponsored filesystem helper returned invalid metadata.',
        )
      }
      return {
        size,
        atimeMs,
        isBlockDevice: () => kind.includes('block'),
        isCharacterDevice: () => kind.includes('character'),
        isDirectory: () => kind.includes('directory'),
        isFIFO: () => kind.includes('fifo') || kind.includes('named pipe'),
        isFile: () => kind.includes('regular file'),
        isSocket: () => kind.includes('socket'),
        isSymbolicLink: () => kind.includes('symbolic link'),
      }
    },
    unlink: async (requested: string) => {
      const resolved = rootedPath(workspaceRoot, requested, 'write', false)
      const parts = segments(resolved)
      const leaf = parts.pop()
      if (!leaf)
        throw new Error('A sponsored run cannot remove its worktree root.')
      await runMutation(
        `${walkDirectories}\ntest ! -L "$1" || exit 73\nrm -f -- "$1" || exit 74`,
        [canonicalRoot, '0', String(parts.length), ...parts, leaf],
      )
    },
    writeFile: async (
      requested: string,
      data: string | Uint8Array,
      options?: unknown,
    ) => {
      const resolved = rootedPath(workspaceRoot, requested, 'write', true)
      const optionObject =
        options && typeof options === 'object'
          ? (options as {
              flag?: string
              mode?: number
              encoding?: BufferEncoding
            })
          : null
      if (optionObject?.flag && optionObject.flag !== 'w') {
        throw new Error('Sponsored file writes only support replacing a file.')
      }
      const stagingDir = await fs.promises.mkdtemp(
        path.join(canonicalRuntimeDir, 'fs-stage-'),
      )
      const staged = path.join(stagingDir, randomUUID())
      try {
        await fs.promises.writeFile(
          staged,
          data,
          typeof options === 'string'
            ? { encoding: options as BufferEncoding }
            : optionObject?.encoding
              ? { encoding: optionObject.encoding }
              : undefined,
        )
        const parts = segments(resolved)
        const leaf = parts.pop()
        if (!leaf)
          throw new Error('A sponsored run cannot replace its worktree root.')
        await runMutation(
          `${walkDirectories}\ntest ! -L "$1" || exit 73\ncp -- "$2" "./$1" || exit 74`,
          [canonicalRoot, '1', String(parts.length), ...parts, leaf, staged],
        )
      } finally {
        await fs.promises.rm(stagingDir, { recursive: true, force: true })
      }
    },
  } as unknown as CodebuffFileSystem
}
