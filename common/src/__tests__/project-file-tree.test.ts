import os from 'os'
import path from 'path'

import { describe, expect, it } from 'bun:test'

import {
  flattenTree,
  getAllPathsWithDirectories,
  getProjectFileTree,
  isFileIgnored,
} from '../project-file-tree'
import { createMockFs } from '../testing/mocks/filesystem'

/**
 * Builds a mock fs from relative file paths under `root`, inferring
 * intermediate directories.
 */
function createFsWithFiles(root: string, files: string[]) {
  const fileRecords: Record<string, string> = {}
  const dirChildren: Record<string, Set<string>> = { [root]: new Set() }
  for (const file of files) {
    fileRecords[path.join(root, file)] = ''
    let child = path.join(root, file)
    let dir = path.dirname(child)
    while (true) {
      ;(dirChildren[dir] ??= new Set()).add(path.basename(child))
      if (dir === root) break
      child = dir
      dir = path.dirname(dir)
    }
  }
  return createMockFs({
    files: fileRecords,
    directories: Object.fromEntries(
      Object.entries(dirChildren).map(([dir, names]) => [dir, [...names]]),
    ),
  })
}

describe('getProjectFileTree', () => {
  it('scans the home directory shallowly instead of returning nothing', async () => {
    const home = os.homedir()
    const fs = createFsWithFiles(home, [
      'top-level.txt',
      'proj/README.md',
      'proj/docs/guide.md',
      'proj/docs/deep/too-deep.md',
      '.hidden/secret.txt',
    ])

    const tree = await getProjectFileTree({ projectRoot: home, fs })
    const paths = getAllPathsWithDirectories(tree).map((p) => p.path)

    // Files up to 3 levels deep are included
    expect(paths).toContain('top-level.txt')
    expect(paths).toContain(path.join('proj', 'README.md'))
    expect(paths).toContain(path.join('proj', 'docs', 'guide.md'))
    // The depth-3 directory shows up as a node, but its contents do not
    expect(paths).toContain(path.join('proj', 'docs', 'deep'))
    expect(paths).not.toContain(
      path.join('proj', 'docs', 'deep', 'too-deep.md'),
    )
    // Dotfiles are still excluded
    expect(paths.some((p) => p.includes('.hidden'))).toBe(false)
  })

  it('scans regular project roots without a depth limit', async () => {
    const root = '/repo'
    const fs = createFsWithFiles(root, ['a/b/c/d/e.txt'])

    const tree = await getProjectFileTree({ projectRoot: root, fs })
    const paths = getAllPathsWithDirectories(tree).map((p) => p.path)

    expect(paths).toContain(path.join('a', 'b', 'c', 'd', 'e.txt'))
  })

  it('records file paths with forward slashes', async () => {
    // `ignore` and the glob patterns the model writes are both POSIX-only, and
    // `ignore` answers false for a backslash path rather than throwing. Storing
    // anything but forward slashes here makes nested rules stop pruning on
    // Windows, which is how build output ends up eating the maxFiles budget.
    const root = '/repo'
    const fs = createFsWithFiles(root, ['app/src/main/Inventory.kt'])

    const tree = await getProjectFileTree({ projectRoot: root, fs })

    const filePaths = flattenTree(tree).map((node) => node.filePath)
    expect(filePaths).toEqual(['app/src/main/Inventory.kt'])
  })

  it('prunes directories ignored by a rule in a nested .gitignore', async () => {
    const root = '/repo'
    const fs = createFsWithFiles(root, [
      'app/.gitignore',
      'app/build/output.class',
      'app/src/Inventory.kt',
    ])
    ;(fs.readFile as any).mockImplementation(async (filePath: string) =>
      String(filePath).endsWith('.gitignore') ? 'build/\n' : '',
    )

    const tree = await getProjectFileTree({ projectRoot: root, fs })

    const filePaths = flattenTree(tree).map((node) => node.filePath)
    expect(filePaths).toContain('app/src/Inventory.kt')
    expect(filePaths).not.toContain('app/build/output.class')
  })
})

describe('isFileIgnored', () => {
  it('reads ignore rules at the filesystem root without looping', async () => {
    const root = path.parse(process.cwd()).root
    const fs = createMockFs({
      files: { [path.join(root, '.gitignore')]: 'readme.txt\n' },
    })

    expect(
      await isFileIgnored({ filePath: 'readme.txt', projectRoot: root, fs }),
    ).toBe(true)
  })
})
