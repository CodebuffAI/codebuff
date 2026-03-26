import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { applyDocEdit, compareScores, readCurrentDocs } from '../docs-optimizer'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('applyDocEdit', () => {
  it('creates new file under docs/ and updates AGENTS.md TOC', () => {
    const result = applyDocEdit(
      tmpDir,
      'patterns/error-handling.md',
      '# Error Handling\n\nAlways use try/catch.',
    )
    expect(result).toBe(true)

    const docPath = path.join(tmpDir, 'docs', 'patterns', 'error-handling.md')
    expect(fs.existsSync(docPath)).toBe(true)
    expect(fs.readFileSync(docPath, 'utf-8')).toContain('Error Handling')

    const agentsMd = fs.readFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      'utf-8',
    )
    expect(agentsMd).toContain('docs/patterns/error-handling.md')
  })

  it('overwrites existing file content', () => {
    // Create initial doc
    applyDocEdit(tmpDir, 'conventions/naming.md', 'Original content')

    // Overwrite
    applyDocEdit(tmpDir, 'conventions/naming.md', 'Updated content')

    const content = fs.readFileSync(
      path.join(tmpDir, 'docs', 'conventions', 'naming.md'),
      'utf-8',
    )
    expect(content).toBe('Updated content')
  })

  it('does not duplicate AGENTS.md entry on overwrite', () => {
    applyDocEdit(tmpDir, 'test.md', 'v1')
    applyDocEdit(tmpDir, 'test.md', 'v2')

    const agentsMd = fs.readFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      'utf-8',
    )
    // The link format is "- [docs/test.md](docs/test.md)" — one entry has two occurrences of the path
    const entryMatches = agentsMd.match(/- \[docs\/test\.md\]/g)
    expect(entryMatches).toHaveLength(1)
  })

  it('rejects path starting with /', () => {
    const result = applyDocEdit(tmpDir, '/etc/passwd', 'bad')
    expect(result).toBe(false)
  })

  it('rejects path with ..', () => {
    const result = applyDocEdit(tmpDir, '../outside/file.md', 'bad')
    expect(result).toBe(false)
  })

  it('creates AGENTS.md if it does not exist', () => {
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false)
    applyDocEdit(tmpDir, 'new-doc.md', 'content')
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true)

    const agentsMd = fs.readFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      'utf-8',
    )
    expect(agentsMd).toContain('# Documentation')
    expect(agentsMd).toContain('docs/new-doc.md')
  })
})

describe('compareScores', () => {
  it('returns improved when new > old', () => {
    expect(compareScores(5.0, 7.0)).toBe('improved')
  })

  it('returns same when new == old', () => {
    expect(compareScores(5.0, 5.0)).toBe('same')
  })

  it('returns worse when new < old', () => {
    expect(compareScores(7.0, 5.0)).toBe('worse')
  })
})

describe('readCurrentDocs', () => {
  it('returns empty object when docs/ does not exist', () => {
    const docs = readCurrentDocs(tmpDir)
    expect(docs).toEqual({})
  })

  it('reads all markdown files recursively', () => {
    const docsDir = path.join(tmpDir, 'docs')
    fs.mkdirSync(path.join(docsDir, 'patterns'), { recursive: true })
    fs.writeFileSync(path.join(docsDir, 'intro.md'), 'intro content')
    fs.writeFileSync(
      path.join(docsDir, 'patterns', 'api.md'),
      'api patterns',
    )
    // Non-md file should be ignored
    fs.writeFileSync(path.join(docsDir, 'notes.txt'), 'ignored')

    const docs = readCurrentDocs(tmpDir)
    expect(Object.keys(docs).sort()).toEqual(['intro.md', 'patterns/api.md'])
    expect(docs['intro.md']).toBe('intro content')
    expect(docs['patterns/api.md']).toBe('api patterns')
  })
})
