import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  classifyIndexWatchPath,
  supportsRecursiveIndexWorkspaceWatcher,
} from '../index-workspace-watcher'

describe('index workspace watcher classification', () => {
  test('disables recursive watching for Bun on Linux to prevent descriptor exhaustion', () => {
    expect(
      supportsRecursiveIndexWorkspaceWatcher({
        platform: 'linux',
        bunVersion: '1.3.11',
      }),
    ).toBe(false)
    expect(supportsRecursiveIndexWorkspaceWatcher({ platform: 'linux' })).toBe(
      true,
    )
    expect(
      supportsRecursiveIndexWorkspaceWatcher({
        platform: 'darwin',
        bunVersion: '1.3.11',
      }),
    ).toBe(true)
  })

  test('classifies live files, deletions, ignored cache paths, and ambiguous directories', () => {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-index-watch-'),
    )
    fs.mkdirSync(path.join(projectRoot, 'src'))
    fs.writeFileSync(path.join(projectRoot, 'src', 'live.ts'), 'export {}\n')

    expect(
      classifyIndexWatchPath({ projectRoot, fileName: 'src/live.ts' }),
    ).toEqual({ kind: 'changed', path: 'src/live.ts' })
    expect(
      classifyIndexWatchPath({ projectRoot, fileName: 'src/deleted.ts' }),
    ).toEqual({ kind: 'deleted', path: 'src/deleted.ts' })
    expect(
      classifyIndexWatchPath({
        projectRoot,
        fileName: '.codebuff-index/index.json',
      }),
    ).toEqual({ kind: 'ignore' })
    expect(classifyIndexWatchPath({ projectRoot, fileName: 'src' })).toEqual({
      kind: 'ambiguous',
    })

    fs.rmSync(projectRoot, { recursive: true, force: true })
  })
})
