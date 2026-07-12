import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { getAffectedTests } from '../tools/get-affected-tests'
import { getBuildTargets } from '../tools/get-build-targets'
import { inspectEnvironment } from '../tools/inspect-environment'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('harness intelligence read tools', () => {
  test('return JSON tool envelopes without executing project scripts', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-read-tools-'))
    roots.push(root)
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { test: 'exit 99', build: 'exit 98' } }),
    )
    fs.writeFileSync(path.join(root, 'app.test.ts'), '')

    expect(inspectEnvironment(root)[0]).toMatchObject({
      type: 'json',
      value: { manifests: ['package.json'] },
    })
    expect(getAffectedTests(root, ['app.ts'])[0]).toMatchObject({
      value: { targets: [{ candidates: ['app.test.ts'] }] },
    })
    expect(getBuildTargets(root, ['app.ts'])[0]).toMatchObject({
      value: { targets: [{ scripts: ['test', 'build'] }] },
    })
  })
})
