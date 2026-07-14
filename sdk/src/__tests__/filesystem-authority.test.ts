import { describe, expect, test } from 'bun:test'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

import {
  FilesystemAuthority,
  MAX_COMMIT_RECEIPTS_PER_RUN,
  allowAllFilesystemPolicy,
  detectFilesystemCapabilities,
  hashFileContent,
} from '../tools/filesystem-authority'

function fsError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code })
}

function makeFileSystem(
  options: {
    realpaths?: Record<string, string>
    files?: Record<string, string | Uint8Array>
    capabilities?: Partial<CodebuffFileSystem>
  } = {},
): CodebuffFileSystem {
  const files = new Map(Object.entries(options.files ?? {}))
  const directories = new Set([
    '/repo',
    '/repo/link',
    '/real/repo',
    '/real/repo/actual',
  ])
  return {
    mkdir: async (input) => {
      directories.add(String(input))
      return undefined
    },
    readdir: async () => [],
    readFile: (async (input: string) => {
      const value = files.get(String(input))
      if (value === undefined) throw fsError('ENOENT')
      return typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
    }) as CodebuffFileSystem['readFile'],
    realpath: (async (input: string) => {
      const value = options.realpaths?.[String(input)]
      if (value) return value
      if (directories.has(String(input)) || files.has(String(input))) {
        return String(input)
      }
      throw fsError('ENOENT')
    }) as CodebuffFileSystem['realpath'],
    stat: (async (input: string) => {
      if (!directories.has(String(input)) && !files.has(String(input))) {
        throw fsError('ENOENT')
      }
      return { isFile: () => files.has(String(input)) }
    }) as CodebuffFileSystem['stat'],
    unlink: async (input) => {
      files.delete(String(input))
    },
    writeFile: async (input, data) => {
      const view = data as NodeJS.ArrayBufferView
      files.set(
        String(input),
        typeof data === 'string'
          ? data
          : new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      )
    },
    ...options.capabilities,
  } as CodebuffFileSystem
}

async function authorize(
  authority: FilesystemAuthority,
  input = 'src/file.ts',
) {
  const result = await authority.authorizePath(input, 'overwrite')
  if (!result.allowed) throw new Error(result.code)
  return result.path
}

describe('FilesystemAuthority paths and policy', () => {
  test('rejects lexical escapes and resolves a create through its canonical parent', async () => {
    const fileSystem = makeFileSystem({
      realpaths: {
        '/repo': '/real/repo',
        '/repo/link': '/real/repo/actual',
      },
    })
    const authority = new FilesystemAuthority(
      '/repo',
      fileSystem,
      allowAllFilesystemPolicy,
    )

    expect((await authority.authorizePath('../secret', 'read')).allowed).toBe(
      false,
    )
    const result = await authority.authorizePath('link/new.ts', 'create')
    expect(result).toEqual({
      allowed: true,
      path: {
        lexicalPath: '/repo/link/new.ts',
        canonicalPath: '/real/repo/actual/new.ts',
        canonicalParentPath: '/real/repo/actual',
        portablePath: 'link/new.ts',
        operationPath: '/real/repo/actual/new.ts',
        redactPath: false,
      },
    })
  })

  test('uses mandatory composed policy hooks', async () => {
    const phases: string[] = []
    const authority = new FilesystemAuthority('/repo', makeFileSystem(), {
      name: 'deny-secrets',
      evaluate(context) {
        phases.push(`${context.phase}:${context.portablePath}`)
        return { allowed: !context.portablePath.includes('secret') }
      },
    })
    expect((await authority.authorizePath('secret.txt', 'read')).allowed).toBe(
      false,
    )
    expect(phases).toEqual(['resolve:secret.txt'])
  })
})

describe('FilesystemAuthority locks and leases', () => {
  test('takes multi-path locks in canonical total order without interleaving', async () => {
    const authority = new FilesystemAuthority(
      '/repo',
      makeFileSystem(),
      allowAllFilesystemPolicy,
    )
    const events: string[] = []
    let releaseFirst!: () => void
    let markFirstStarted!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })

    const first = authority.withPathLocks(['/repo/b', '/repo/a'], async () => {
      events.push('first:start')
      markFirstStarted()
      await firstGate
      events.push('first:end')
    })
    await firstStarted
    const second = authority.withPathLocks(['/repo/a', '/repo/b'], async () => {
      events.push('second:start')
      events.push('second:end')
    })
    expect(events).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })

  test('cancel wins while open and commit wins after beginCommit', async () => {
    const authority = new FilesystemAuthority(
      '/repo',
      makeFileSystem(),
      allowAllFilesystemPolicy,
    )
    const file = await authorize(authority)
    authority.registerOperation({
      id: 'cancel-first',
      kind: 'overwrite',
      paths: [file],
    })
    expect(authority.cancel('cancel-first')).toEqual({ cancelled: true })
    expect(authority.beginCommit('cancel-first')).toEqual({
      begun: false,
      state: 'cancelled',
    })

    authority.registerOperation({
      id: 'commit-first',
      kind: 'overwrite',
      paths: [file],
    })
    const begun = authority.beginCommit('commit-first')
    expect(begun.begun).toBe(true)
    expect(authority.cancel('commit-first')).toEqual({
      cancelled: false,
      state: 'committing',
    })
    if (!begun.begun) throw new Error('commit did not begin')
    expect(authority.finishCommit(begun.lease, { succeeded: true })).toEqual({
      finished: true,
      state: 'committed',
    })
  })
})

describe('FilesystemAuthority capabilities, snapshots, and receipts', () => {
  test('[ERR-M04] reports text range capability without pretending unsupported operations are atomic', async () => {
    const baselineFs = makeFileSystem()
    expect(detectFilesystemCapabilities(baselineFs).tier).toBe('baseline')
    const baseline = new FilesystemAuthority(
      '/repo',
      baselineFs,
      allowAllFilesystemPolicy,
    )
    const baselinePath = await authorize(baseline)
    expect(await baseline.createExclusive(baselinePath, 'x')).toEqual({
      supported: false,
      reason: 'unsupported',
    })

    const atomicFs = makeFileSystem({
      capabilities: {
        mutationAuthority: 'native_atomic',
        readRange: async () => ({ data: new Uint8Array(), endExclusive: 0 }),
        readTextRange: async () => ({
          data: new Uint8Array(),
          startLine: 1,
          endLine: 0,
          totalLines: 0,
          complete: true,
        }),
        createFileExclusive: async () => {},
        conditionalCommit: async () => ({ applied: true }),
        conditionalDelete: async () => ({ applied: true }),
        conditionalMove: async () => ({ applied: true }),
      },
    })
    const snapshot = detectFilesystemCapabilities(atomicFs)
    expect(snapshot.tier).toBe('atomic')
    expect([...snapshot.capabilities].sort()).toEqual([
      'baseline',
      'conditional_commit',
      'conditional_delete',
      'conditional_move',
      'exclusive_create',
      'range_read',
      'text_range_read',
    ])

    const cooperativeFs = makeFileSystem({
      capabilities: {
        mutationAuthority: 'cooperative_cas',
        createFileExclusive: async () => {},
        conditionalCommit: async () => ({ applied: true }),
        conditionalDelete: async () => ({ applied: true }),
        conditionalMove: async () => ({ applied: true }),
      },
    })
    expect(detectFilesystemCapabilities(cooperativeFs).tier).toBe(
      'cooperative',
    )

    const undeclaredFs = makeFileSystem({
      capabilities: {
        createFileExclusive: async () => {},
        conditionalCommit: async () => ({ applied: true }),
        conditionalDelete: async () => ({ applied: true }),
        conditionalMove: async () => ({ applied: true }),
      },
    })
    expect(detectFilesystemCapabilities(undeclaredFs).tier).toBe('enhanced')
  })

  test('hashes bytes deterministically and revalidates expected state', async () => {
    const fileSystem = makeFileSystem({
      files: { '/repo/src/file.ts': 'hello' },
    })
    const authority = new FilesystemAuthority(
      '/repo',
      fileSystem,
      allowAllFilesystemPolicy,
    )
    const file = await authorize(authority)
    const hash = hashFileContent(Buffer.from('hello'))
    expect(await authority.snapshot(file)).toEqual({
      state: 'present',
      hash,
      byteLength: 5,
    })
    expect(
      await authority.revalidateExpectedState(file, { state: 'present', hash }),
    ).toEqual({
      matches: true,
      actual: { state: 'present', hash, byteLength: 5 },
    })
  })

  test('retains only the newest bounded receipts', async () => {
    const authority = new FilesystemAuthority(
      '/repo',
      makeFileSystem(),
      allowAllFilesystemPolicy,
    )
    const file = await authorize(authority)
    for (let index = 0; index < MAX_COMMIT_RECEIPTS_PER_RUN + 3; index++) {
      const id = `operation-${index}`
      authority.registerOperation({ id, kind: 'overwrite', paths: [file] })
      authority.cancel(id)
    }
    const receipts = authority.listReceipts()
    expect(receipts).toHaveLength(MAX_COMMIT_RECEIPTS_PER_RUN)
    expect(receipts[0]?.operationId).toBe('operation-3')
    expect(receipts.at(-1)?.operationId).toBe(
      `operation-${MAX_COMMIT_RECEIPTS_PER_RUN + 2}`,
    )
  })

  test('redacts sensitive paths and sanitizes observable error metadata', async () => {
    const authority = new FilesystemAuthority('/repo', makeFileSystem(), {
      name: 'sensitive',
      evaluate: () => ({ allowed: true, redactPath: true }),
    })
    const file = await authorize(authority, 'secrets/token.txt')
    authority.registerOperation({
      id: 'redacted',
      kind: 'overwrite',
      paths: [file],
    })
    const begun = authority.beginCommit('redacted')
    if (!begun.begun) throw new Error('commit did not begin')
    authority.finishCommit(begun.lease, {
      succeeded: false,
      errorCode: 'permission denied: token=super-secret',
    })
    const receipt = authority.listReceipts()[0]
    expect(receipt?.paths[0]?.label).toBe('[redacted]')
    expect(receipt?.paths[0]?.fingerprint).toMatch(/^[a-f0-9]{16}$/)
    expect(JSON.stringify(receipt)).not.toContain('secrets/token.txt')
    expect(JSON.stringify(receipt)).not.toContain('super-secret')
    expect(receipt?.error?.code).toBe('OPERATION_FAILED')
  })
})
