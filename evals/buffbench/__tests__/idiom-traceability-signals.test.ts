import { expect, describe, test } from 'bun:test'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

import {
  computeIdiomTraceabilitySignals,
  evaluateIdiomTraceability,
  idiomPathForLanguage,
  languageForEditedPath,
  normalizeTracePath,
} from '../idiom-traceability-signals'

function toolCall(
  toolName: string,
  input: Record<string, unknown>,
  toolCallId: string,
): PrintModeEvent {
  return {
    type: 'tool_call',
    toolCallId,
    toolName,
    input,
  } as PrintModeEvent
}

function readFiles(
  input: Record<string, unknown>,
  toolCallId = 'read-1',
): PrintModeEvent {
  return toolCall('read_files', input, toolCallId)
}

function edit(
  toolName: string,
  path: string,
  toolCallId = 'edit-1',
): PrintModeEvent {
  return toolCall(toolName, { path }, toolCallId)
}

function editTransaction(
  paths: string[],
  toolCallId = 'edit-tx-1',
): PrintModeEvent {
  return toolCall(
    'edit_transaction',
    { edits: paths.map((path) => ({ type: 'str_replace', path })) },
    toolCallId,
  )
}

describe('path helpers', () => {
  test('normalizes leading dot, duplicate slashes, and backslashes', () => {
    expect(normalizeTracePath('./agents//idioms\\python.md')).toBe(
      'agents/idioms/python.md',
    )
  })

  test('maps source paths to supported language ids', () => {
    expect(languageForEditedPath('src/main.py')).toBe('python')
    expect(languageForEditedPath('src/lib.rs')).toBe('rust')
    expect(languageForEditedPath('cmd/server.go')).toBe('go')
    expect(languageForEditedPath('src/App.java')).toBe('java')
    expect(languageForEditedPath('src/App.cs')).toBe('csharp')
    expect(languageForEditedPath('src/native.hpp')).toBe('cpp')
    expect(languageForEditedPath('lib/app.rb')).toBe('ruby')
    expect(languageForEditedPath('src/index.php')).toBe('php')
    expect(languageForEditedPath('Sources/App.swift')).toBe('swift')
    expect(languageForEditedPath('src/Main.kt')).toBe('kotlin')
    expect(languageForEditedPath('scripts/player.gd')).toBe('gdscript')
  })

  test('treats TypeScript and JavaScript as exempt', () => {
    expect(languageForEditedPath('src/app.ts')).toBe('typescript')
    expect(languageForEditedPath('src/app.tsx')).toBe('typescript')
    expect(languageForEditedPath('src/app.js')).toBe('typescript')
    expect(languageForEditedPath('src/app.jsx')).toBe('typescript')
  })
})

describe('computeIdiomTraceabilitySignals', () => {
  test('marks non-TS edits covered by bundled capability guidance', () => {
    const events: PrintModeEvent[] = [
      readFiles({ paths: [idiomPathForLanguage('python')] }),
      edit('str_replace', 'src/app.py'),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.isEmpty).toBe(false)
    expect(signals.nonTypeScriptEditCount).toBe(1)
    expect(signals.hasRequiredReads).toBe(true)
    expect(signals.languageSignals).toEqual([
      {
        languageId: 'python',
        idiomPath: 'bundled:language-capabilities/python',
        editedPaths: ['src/app.py'],
        firstEditIndex: 1,
        satisfied: true,
      },
    ])

    const evaluation = evaluateIdiomTraceability(signals)
    expect(evaluation.verdict).toBe('skip')
    expect(evaluation.reasons[0]).toContain('prompt-construction tests')
  })

  test('does not depend on project-relative idiom reads', () => {
    const events: PrintModeEvent[] = [
      edit('write_file', 'src/lib.rs'),
      readFiles({ paths: [idiomPathForLanguage('rust')] }),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.hasRequiredReads).toBe(true)
    expect(signals.languageSignals[0]).toMatchObject({
      languageId: 'rust',
      firstEditIndex: 0,
      idiomPath: 'bundled:language-capabilities/rust',
      satisfied: true,
    })

    const evaluation = evaluateIdiomTraceability(signals)
    expect(evaluation.verdict).toBe('skip')
  })

  test('skips when only TypeScript or unknown-extension edits are detected', () => {
    const events: PrintModeEvent[] = [
      edit('str_replace', 'src/app.ts'),
      edit('write_file', 'README.md'),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.isEmpty).toBe(true)
    expect(signals.nonTypeScriptEditCount).toBe(0)
    expect(signals.languageSignals).toEqual([])

    const evaluation = evaluateIdiomTraceability(signals)
    expect(evaluation.verdict).toBe('skip')
    expect(evaluation.reasons[0]).toContain('No non-TypeScript')
  })

  test('covers every edited non-TS language from the canonical registry', () => {
    const events: PrintModeEvent[] = [
      readFiles({ paths: [idiomPathForLanguage('python')] }, 'read-python'),
      edit('str_replace', 'src/app.py', 'edit-python'),
      edit('rewrite_symbol', 'src/main.go', 'edit-go'),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.languageSignals.map((signal) => signal.languageId)).toEqual([
      'python',
      'go',
    ])
    expect(signals.languageSignals[0].satisfied).toBe(true)
    expect(signals.languageSignals[1].satisfied).toBe(true)

    const evaluation = evaluateIdiomTraceability(signals)
    expect(evaluation.verdict).toBe('skip')
    expect(evaluation.reasons).toHaveLength(1)
  })

  test('uses the first edit for a language and aggregates repeated edit paths', () => {
    const events: PrintModeEvent[] = [
      edit('str_replace', 'src/a.py', 'edit-a'),
      readFiles({ paths: [idiomPathForLanguage('python')] }, 'read-python'),
      edit('write_file', 'src/b.py', 'edit-b'),
      edit('rewrite_symbol', 'src/a.py', 'edit-a-again'),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.nonTypeScriptEditCount).toBe(3)
    expect(signals.languageSignals).toHaveLength(1)
    expect(signals.languageSignals[0]).toMatchObject({
      languageId: 'python',
      editedPaths: ['src/a.py', 'src/b.py'],
      firstEditIndex: 0,
      satisfied: true,
    })
  })

  test('detects read_files ranges and symbols as idiom reads', () => {
    const events: PrintModeEvent[] = [
      readFiles(
        {
          ranges: [
            { path: './agents/idioms/ruby.md', startLine: 1, endLine: 10 },
          ],
          symbols: [{ path: 'agents/idioms/go.md', names: ['anything'] }],
        },
        'read-ranges-symbols',
      ),
      edit('str_replace', 'lib/app.rb', 'edit-ruby'),
      edit('str_replace', 'cmd/app.go', 'edit-go'),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.hasRequiredReads).toBe(true)
    expect(signals.languageSignals.map((signal) => signal.languageId)).toEqual([
      'ruby',
      'go',
    ])
  })

  test('extracts edited paths from edit_transaction', () => {
    const events: PrintModeEvent[] = [
      readFiles({ paths: [idiomPathForLanguage('java')] }),
      editTransaction(['src/App.java', 'src/App.ts']),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.nonTypeScriptEditCount).toBe(1)
    expect(signals.languageSignals).toHaveLength(1)
    expect(signals.languageSignals[0]).toMatchObject({
      languageId: 'java',
      editedPaths: ['src/App.java'],
      satisfied: true,
    })
  })

  test('ignores proposed edits because they are not applied source changes', () => {
    const events: PrintModeEvent[] = [
      edit('propose_str_replace', 'src/app.py', 'proposal'),
      readFiles({ paths: [idiomPathForLanguage('python')] }, 'read-python'),
      edit('str_replace', 'src/app.py', 'applied-edit'),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.nonTypeScriptEditCount).toBe(1)
    expect(signals.languageSignals).toEqual([
      {
        languageId: 'python',
        idiomPath: 'bundled:language-capabilities/python',
        editedPaths: ['src/app.py'],
        firstEditIndex: 2,
        satisfied: true,
      },
    ])
  })

  test('tracks apply_patch and GDScript edits', () => {
    const events = [
      toolCall(
        'apply_patch',
        {
          patch:
            '*** Begin Patch\n*** Update File: scripts/player.gd\n@@\n-pass\n+print("ready")\n*** End Patch',
        },
        'patch-gdscript',
      ),
    ]

    const signals = computeIdiomTraceabilitySignals(events)
    expect(signals.languageSignals).toEqual([
      {
        languageId: 'gdscript',
        idiomPath: 'bundled:language-capabilities/gdscript',
        editedPaths: ['scripts/player.gd'],
        firstEditIndex: 0,
        satisfied: true,
      },
    ])
  })
})
