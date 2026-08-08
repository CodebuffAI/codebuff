import { DEFAULT_MAX_FILES } from '@codebuff/common/project-file-tree'
import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { describe, expect, it } from 'bun:test'

import { glob } from '../tools/glob'

const ROOT = '/proj'

/** Mock fs from relative paths under ROOT, inferring intermediate directories. */
function fsWithFiles(files: string[]) {
  const fileRecords: Record<string, string> = {}
  const dirChildren: Record<string, Set<string>> = { [ROOT]: new Set() }
  for (const file of files) {
    fileRecords[`${ROOT}/${file}`] = ''
    const segments = file.split('/')
    let dir = ROOT
    for (const [i, segment] of segments.entries()) {
      ;(dirChildren[dir] ??= new Set()).add(segment)
      if (i === segments.length - 1) break
      dir = `${dir}/${segment}`
    }
  }
  return createMockFs({
    files: fileRecords,
    directories: Object.fromEntries(
      Object.entries(dirChildren).map(([dir, names]) => [dir, [...names]]),
    ),
  })
}

async function globCount(fs: ReturnType<typeof fsWithFiles>, pattern: string) {
  const [output] = await glob({ pattern, projectPath: ROOT, fs })
  return output.value as { count: number; files: string[]; message: string }
}

describe('glob', () => {
  it('says the result is partial when the project scan hits its file cap', async () => {
    // The scan is breadth-first and stops dead at DEFAULT_MAX_FILES, so a deep
    // file past the cut-off is simply absent from the tree. Reporting that as a
    // flat "Found 0 file(s)" reads as proof the file does not exist — which is
    // exactly how a user ended up believing glob could not see .kt files.
    const junk = Array.from(
      { length: DEFAULT_MAX_FILES + 500 },
      (_, i) => `app/build/chunk${Math.floor(i / 500)}/f${i}.class`,
    )
    const fs = fsWithFiles([
      ...junk,
      'app/src/main/java/com/example/ui/Inventory.kt',
    ])

    const result = await globCount(fs, '**/*.kt')

    expect(result.count).toBe(0)
    expect(result.message).toContain(`${DEFAULT_MAX_FILES}-file limit`)
  })

  it('does not warn when the whole project was scanned', async () => {
    const fs = fsWithFiles([
      'app/src/main/java/com/example/ui/Inventory.kt',
      'docs/guide.md',
    ])

    const result = await globCount(fs, '**/*.kt')

    expect(result.count).toBe(1)
    expect(result.message).not.toContain('limit')
  })

  it('matches deeply nested files against a recursive pattern', async () => {
    const fs = fsWithFiles([
      'app/src/main/java/com/example/ui/Inventory.kt',
      'app/src/main/java/com/example/BackendCapabilities.kt',
      'app/src/main/res/values/strings.xml',
      'docs/guide.md',
    ])

    expect((await globCount(fs, '**/*.kt')).count).toBe(2)
    expect((await globCount(fs, '**/BackendCapabilities*')).count).toBe(1)
    expect((await globCount(fs, '**/*.xml')).count).toBe(1)
  })

  it('returns everything when no maxResults is given', async () => {
    const fs = fsWithFiles(
      Array.from({ length: 150 }, (_, i) => `src/f${i}.ts`),
    )
    const result = await globCount(fs, '**/*.ts')

    expect(result.count).toBe(150)
    expect(result.files.length).toBe(150)
    expect(result.message).not.toContain('Showing the first')
  })

  it('caps returned files at maxResults while count reports the true total', async () => {
    const fs = fsWithFiles(
      Array.from({ length: 150 }, (_, i) => `src/f${i}.ts`),
    )
    const [output] = await glob({
      pattern: '**/*.ts',
      projectPath: ROOT,
      maxResults: 100,
      fs,
    })
    const result = output.value as {
      count: number
      files: string[]
      message: string
    }

    expect(result.count).toBe(150)
    expect(result.files.length).toBe(100)
    expect(result.message).toContain('Found 150 file(s)')
    expect(result.message).toContain('Showing the first 100')
  })
})
