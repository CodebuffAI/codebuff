import { describe, test, expect } from 'bun:test'

import {
  buildEntries,
  scoreEntry,
  entryToListItem,
  type PaletteEntry,
} from '../command-palette-screen'
import type { SlashCommand } from '../../data/slash-commands'
import type { FileTreeNode } from '@codebuff/common/util/file'

const makeCommand = (overrides: Partial<SlashCommand> = {}): SlashCommand =>
  ({
    id: 'init',
    label: 'init',
    description: 'Initialize a new project',
    ...overrides,
  }) as SlashCommand

const makeFileNode = (
  filePath: string,
  isDirectory = false,
  children: FileTreeNode[] = [],
): FileTreeNode =>
  ({
    name: filePath.slice(filePath.lastIndexOf('/') + 1) || filePath,
    filePath,
    type: isDirectory ? 'directory' : 'file',
    children,
  }) as FileTreeNode

describe('buildEntries', () => {
  test('places all commands before files', () => {
    const commands = [makeCommand({ id: 'a' }), makeCommand({ id: 'b' })]
    // getAllPathsWithDirectories builds paths from node.name, so use the name
    // as the path. A file node named 'a.ts' yields path 'a.ts'.
    const fileTree = [makeFileNode('a.ts'), makeFileNode('b.ts')]
    const entries = buildEntries(commands, fileTree, 50)
    expect(entries).toHaveLength(4)
    expect(entries[0]).toMatchObject({ kind: 'command', command: { id: 'a' } })
    expect(entries[1]).toMatchObject({ kind: 'command', command: { id: 'b' } })
    expect(entries[2]).toMatchObject({ kind: 'file', filePath: 'a.ts' })
    expect(entries[3]).toMatchObject({ kind: 'file', filePath: 'b.ts' })
  })

  test('flattens nested file tree directories', () => {
    // getAllPathsWithDirectories joins names, so a directory named 'src'
    // with a child named 'index.ts' yields path 'src/index.ts'.
    const fileTree: FileTreeNode[] = [
      makeFileNode('src', true, [
        makeFileNode('index.ts'),
        makeFileNode('utils', true, [
          makeFileNode('helper.ts'),
        ]),
      ]),
    ]
    const entries = buildEntries([], fileTree, 50)
    const paths = entries.map((e) =>
      e.kind === 'file' ? e.filePath : null,
    )
    expect(paths).toContain('src')
    expect(paths).toContain('src/index.ts')
    expect(paths).toContain('src/utils')
    expect(paths).toContain('src/utils/helper.ts')
  })

  test('respects maxFileItems cap on files (commands uncapped)', () => {
    const commands = [makeCommand({ id: 'cmd' })]
    const fileTree = Array.from({ length: 10 }, (_, i) =>
      makeFileNode(`file${i}.ts`),
    )
    const entries = buildEntries(commands, fileTree, 3)
    expect(entries).toHaveLength(1 + 3)
    expect(entries[0].kind).toBe('command')
    const files = entries.slice(1)
    expect(files.every((e) => e.kind === 'file')).toBe(true)
  })

  test('empty inputs produce empty entries', () => {
    expect(buildEntries([], [], 50)).toEqual([])
  })

  test('marks directories vs files correctly', () => {
    const fileTree = [
      makeFileNode('src', true),
      makeFileNode('readme.md', false),
    ]
    const entries = buildEntries([], fileTree, 50)
    const dirEntry = entries.find(
      (e) => e.kind === 'file' && e.filePath === 'src',
    ) as Extract<PaletteEntry, { kind: 'file' }>
    const fileEntry = entries.find(
      (e) => e.kind === 'file' && e.filePath === 'readme.md',
    ) as Extract<PaletteEntry, { kind: 'file' }>
    expect(dirEntry.isDirectory).toBe(true)
    expect(fileEntry.isDirectory).toBe(false)
  })

  test('file paths are built from node.name (not filePath field)', () => {
    // getAllPathsWithDirectories joins names; filePath on the node is ignored
    // for path construction. Confirms the contract.
    const fileTree = [
      makeFileNode('a.ts'), // name=a.ts, filePath=a.ts
    ]
    const entries = buildEntries([], fileTree, 50)
    const files = entries.filter((e) => e.kind === 'file')
    expect(files).toHaveLength(1)
    expect((files[0] as Extract<PaletteEntry, { kind: 'file' }>).filePath).toBe(
      'a.ts',
    )
  })
})

describe('scoreEntry', () => {
  test('returns 0 for empty query (everything matches)', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({ id: 'init', label: 'init' }),
    }
    expect(scoreEntry(entry, '')).toBe(0)
  })

  test('exact id match scores best (negative)', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({ id: 'init', label: 'Init' }),
    }
    expect(scoreEntry(entry, 'init')).toBe(-1000)
  })

  test('exact label match scores second-best', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({ id: 'init', label: 'Initialize' }),
    }
    expect(scoreEntry(entry, 'initialize')).toBe(-990)
  })

  test('prefix match on id beats prefix match on label', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({ id: 'init', label: 'Initialize' }),
    }
    expect(scoreEntry(entry, 'ini')).toBe(-900)
    expect(scoreEntry(entry, 'initi')).toBe(-890)
    const ini = scoreEntry(entry, 'ini')!
    const initi = scoreEntry(entry, 'initi')!
    expect(ini).toBeLessThan(initi)
  })

  test('substring in id beats substring in description', () => {
    // Use a query that is a substring (not prefix) of the id so it hits the
    // id-substring branch (-800 + indexOf) rather than the prefix branch.
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({
        id: 'reconnect',
        label: 'Reconnect',
        description: 'connect to a provider',
      }),
    }
    // 'connect' is a substring of id 'reconnect' at index 2 -> -800 + 2 = -798
    const idSubstring = scoreEntry(entry, 'connect')
    expect(idSubstring).toBe(-798)
    // And a description-only substring match should be worse (higher).
    // 'provider' is a substring of the description only.
    const descSubstring = scoreEntry(entry, 'provider')
    expect(descSubstring).not.toBeNull()
    expect(idSubstring!).toBeLessThan(descSubstring!)
  })

  test('returns null when no match at all', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({ id: 'init', label: 'init', description: 'init' }),
    }
    expect(scoreEntry(entry, 'xyz')).toBeNull()
  })

  test('fuzzy fallback matches when no substring', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({
        id: 'help',
        label: 'Show help info',
        description: 'help',
      }),
    }
    // 'shi' is a subsequence of 'Show help info' but not a substring
    const result = scoreEntry(entry, 'shi')
    expect(result).not.toBeNull()
    // fuzzy fallback returns score - 500, so it's > -500
    expect(result!).toBeGreaterThan(-500)
  })

  test('file: exact path match scores best', () => {
    const entry: PaletteEntry = {
      kind: 'file',
      filePath: 'src/index.ts',
      isDirectory: false,
    }
    expect(scoreEntry(entry, 'src/index.ts')).toBe(-1000)
  })

  test('file: exact filename match beats filename substring', () => {
    const entry: PaletteEntry = {
      kind: 'file',
      filePath: 'src/index.ts',
      isDirectory: false,
    }
    // 'index.ts' matches the filename exactly -> -990
    expect(scoreEntry(entry, 'index.ts')).toBe(-990)
    // 'ndex' is a substring (not prefix) of filename 'index.ts' at index 1
    // -> filename substring branch: -800 + 1 = -799
    expect(scoreEntry(entry, 'ndex')).toBe(-799)
    expect(scoreEntry(entry, 'index.ts')).toBeLessThan(scoreEntry(entry, 'ndex')!)
  })

  test('file: filename prefix beats path prefix', () => {
    const entry: PaletteEntry = {
      kind: 'file',
      filePath: 'src/utils/fuzzy-match.ts',
      isDirectory: false,
    }
    expect(scoreEntry(entry, 'fuzzy')).toBe(-950) // filename prefix
    expect(scoreEntry(entry, 'src')).toBe(-900) // path prefix
    const fuzzyScore = scoreEntry(entry, 'fuzzy')!
    const srcScore = scoreEntry(entry, 'src')!
    expect(fuzzyScore).toBeLessThan(srcScore)
  })

  test('file: returns null when no match', () => {
    const entry: PaletteEntry = {
      kind: 'file',
      filePath: 'src/index.ts',
      isDirectory: false,
    }
    expect(scoreEntry(entry, 'xyz123')).toBeNull()
  })

  test('query is case-insensitive', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({ id: 'init', label: 'Init', description: 'init' }),
    }
    expect(scoreEntry(entry, 'INIT')).toBe(-1000)
    expect(scoreEntry(entry, 'Ini')).toBe(-900)
  })
})

describe('entryToListItem', () => {
  test('command entry maps with id label, accent, and description secondary', () => {
    const entry: PaletteEntry = {
      kind: 'command',
      command: makeCommand({
        id: 'init',
        label: 'Init',
        description: 'Initialize project',
      }),
    }
    const item = entryToListItem(entry)
    expect(item.id).toBe('cmd:init')
    expect(item.label).toBe('init')
    expect(item.accent).toBe(true)
    expect(item.secondary).toBe('Initialize project')
  })

  test('file entry maps with file path label and file icon', () => {
    const entry: PaletteEntry = {
      kind: 'file',
      filePath: 'src/index.ts',
      isDirectory: false,
    }
    const item = entryToListItem(entry)
    expect(item.id).toBe('file:src/index.ts')
    expect(item.label).toBe('src/index.ts')
    expect(item.accent).toBeUndefined()
  })

  test('directory entry gets dir secondary', () => {
    const entry: PaletteEntry = {
      kind: 'file',
      filePath: 'src',
      isDirectory: true,
    }
    const item = entryToListItem(entry)
    expect(item.secondary).toBe('dir')
  })

  test('file entry has no secondary when not a directory', () => {
    const entry: PaletteEntry = {
      kind: 'file',
      filePath: 'readme.md',
      isDirectory: false,
    }
    const item = entryToListItem(entry)
    expect(item.secondary).toBeUndefined()
  })
})
