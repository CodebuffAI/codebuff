import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  BUILD_IDENTITY_SCHEMA_VERSION,
  createBuildIdentity,
} from '../build-identity'

describe('compiled binary identity', () => {
  test('uses a versioned, machine-readable contract', () => {
    expect(
      createBuildIdentity({
        product: 'freebuff',
        version: '1.2.3',
        target: 'win32-x64',
      }),
    ).toEqual({
      schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
      product: 'freebuff',
      version: '1.2.3',
      target: 'win32-x64',
    })
  })

  test('preserves baseline target labels', () => {
    expect(
      createBuildIdentity({
        product: 'freebuff',
        version: '1.2.3',
        target: 'win32-x64-baseline',
      }).target,
    ).toBe('win32-x64-baseline')
  })

  test('entrypoint reports identity without loading the UI', () => {
    const entryPath = fileURLToPath(new URL('../entry.ts', import.meta.url))
    const result = spawnSync(
      process.execPath,
      [entryPath, '--print-build-info'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          CODEBUFF_CLI_BINARY_NAME: 'freebuff',
          CODEBUFF_CLI_VERSION: '9.8.7',
          CODEBUFF_CLI_TARGET: 'win32-x64',
        },
      },
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
      product: 'freebuff',
      version: '9.8.7',
      target: 'win32-x64',
    })
  })
})
