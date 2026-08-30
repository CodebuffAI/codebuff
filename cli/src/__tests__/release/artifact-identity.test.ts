import { afterEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { createLauncher } = require('../../../release-core/launcher.js')

const fixtureDirs: string[] = []

afterEach(() => {
  for (const directory of fixtureDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function identityBinary({
  identity,
  body,
}: {
  identity?: unknown
  body?: string
}): string {
  const directory = mkdtempSync(join(tmpdir(), 'artifact-identity-'))
  fixtureDirs.push(directory)
  const binary = join(directory, 'candidate')
  const serializedIdentity = JSON.stringify(identity) ?? 'null'
  const script = body ?? `printf '%s\\n' '${serializedIdentity}'`
  writeFileSync(binary, `#!/bin/sh\n${script}\n`, { mode: 0o755 })
  chmodSync(binary, 0o755)
  return binary
}

function validator(timeoutMs = 10000) {
  const configDir = mkdtempSync(join(tmpdir(), 'artifact-config-'))
  fixtureDirs.push(configDir)
  return createLauncher({
    packageName: 'freebuff',
    displayName: 'Freebuff',
    configDir,
    buildIdentityTimeoutMs: timeoutMs,
  }).__testing.validateStagedBinary
}

const expected = {
  schemaVersion: 1,
  product: 'freebuff',
  version: '1.2.3',
  target: 'win32-x64',
}

describe('downloaded artifact identity validation', () => {
  test('accepts the requested product, version, and target', async () => {
    await expect(
      validator()({
        tempBinaryPath: identityBinary({ identity: expected }),
        version: expected.version,
        targetKey: expected.target,
      }),
    ).resolves.toBeUndefined()
  })

  for (const [field, value] of [
    ['product', 'codebuff'],
    ['version', '1.2.2'],
    ['target', 'linux-arm64'],
    ['schemaVersion', 2],
  ] as const) {
    test(`rejects a mismatched ${field}`, async () => {
      const identity = { ...expected, [field]: value }
      await expect(
        validator()({
          tempBinaryPath: identityBinary({ identity }),
          version: expected.version,
          targetKey: expected.target,
        }),
      ).rejects.toMatchObject({ code: 'ARTIFACT_IDENTITY_MISMATCH' })
    })
  }

  test('rejects an unrelated bundled script', async () => {
    await expect(
      validator()({
        tempBinaryPath: identityBinary({
          body: "echo 'Usage: node test-bootstrap-caching.mjs PLUGIN_PATH present|missing' >&2; exit 1",
        }),
        version: expected.version,
        targetKey: expected.target,
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_IDENTITY_EXEC_FAILED' })
  })

  test('reports an artifact that cannot be executed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'missing-artifact-'))
    fixtureDirs.push(directory)
    await expect(
      validator()({
        tempBinaryPath: join(directory, 'freebuff'),
        version: expected.version,
        targetKey: expected.target,
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_IDENTITY_EXEC_FAILED' })
  })

  test('rejects malformed output', async () => {
    await expect(
      validator()({
        tempBinaryPath: identityBinary({ body: "echo 'not json'" }),
        version: expected.version,
        targetKey: expected.target,
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_IDENTITY_INVALID' })
  })

  test('bounds identity command output', async () => {
    await expect(
      validator()({
        tempBinaryPath: identityBinary({
          body: 'i=0; while [ $i -lt 5000 ]; do printf x; i=$((i+1)); done',
        }),
        version: expected.version,
        targetKey: expected.target,
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_IDENTITY_INVALID' })
  })

  test('bounds a hung identity check', async () => {
    await expect(
      validator(50)({
        tempBinaryPath: identityBinary({ body: 'sleep 5' }),
        version: expected.version,
        targetKey: expected.target,
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_IDENTITY_TIMEOUT' })
  })

  test('does not replace a cached binary with a mislabeled release artifact', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'artifact-cache-'))
    const archiveDir = mkdtempSync(join(tmpdir(), 'artifact-archive-'))
    fixtureDirs.push(configDir, archiveDir)

    const launcher = createLauncher({
      packageName: 'freebuff',
      displayName: 'Freebuff',
      wrapperVersion: '2.0.0',
      includeTreeSitterWasm: false,
      configDir,
    })
    const { CONFIG } = launcher.__testing
    const target = `${process.platform}-${process.arch}`
    const cachedContents = '#!/bin/sh\necho cached\n'
    writeFileSync(CONFIG.binaryPath, cachedContents, { mode: 0o755 })
    writeFileSync(
      CONFIG.metadataPath,
      JSON.stringify({ version: '1.0.0', target }),
    )

    const wrongBinary = identityBinary({
      identity: {
        schemaVersion: 1,
        product: 'codebuff',
        version: '2.0.0',
        target,
      },
    })
    writeFileSync(
      join(archiveDir, CONFIG.binaryName),
      readFileSync(wrongBinary),
      { mode: 0o755 },
    )
    const archivePath = join(archiveDir, 'release.tar.gz')
    const tar = require('tar') as typeof import('tar')
    await tar.c({ cwd: archiveDir, file: archivePath, gzip: true }, [
      CONFIG.binaryName,
    ])
    const archive = readFileSync(archivePath)

    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-length': archive.byteLength,
        'content-type': 'application/gzip',
      })
      response.end(archive)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    const previousAppUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
    const previousNoProxy = process.env.NO_PROXY
    const { port } = server.address() as AddressInfo
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = `http://127.0.0.1:${port}`
    process.env.NO_PROXY = '127.0.0.1'

    const originalConsoleError = console.error
    console.error = () => {}
    try {
      await launcher.__testing.ensureBinaryReady()
      expect(readFileSync(CONFIG.binaryPath, 'utf8')).toBe(cachedContents)
      expect(
        JSON.parse(readFileSync(CONFIG.metadataPath, 'utf8')),
      ).toMatchObject({ version: '1.0.0', target })
    } finally {
      console.error = originalConsoleError
      if (previousAppUrl === undefined) {
        delete process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
      } else {
        process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = previousAppUrl
      }
      if (previousNoProxy === undefined) delete process.env.NO_PROXY
      else process.env.NO_PROXY = previousNoProxy
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
