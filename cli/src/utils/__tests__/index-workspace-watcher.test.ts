import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { classifyIndexWatchPath } from '../index-workspace-watcher'

describe('index workspace watcher classification', () => {
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
