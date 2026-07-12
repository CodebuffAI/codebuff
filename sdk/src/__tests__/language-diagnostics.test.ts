import { describe, expect, test } from 'bun:test'

import { parseLanguageDiagnostics } from '../tools/language-diagnostics'

describe('parseLanguageDiagnostics', () => {
  test('normalizes compiler diagnostics to project-relative, 1-indexed ranges', () => {
    const diagnostics = parseLanguageDiagnostics({
      command: 'npx --no-install tsc --noEmit',
      cwd: '/repo',
      stderr: '/repo/src/index.ts(4,7): error TS2322: Type mismatch',
    })

    expect(diagnostics).toEqual([
      {
        file: 'src/index.ts',
        range: {
          start: { line: 4, column: 7 },
          end: { line: 4, column: 7 },
        },
        severity: 'error',
        code: 'TS2322',
        message: 'Type mismatch',
        command: 'npx --no-install tsc --noEmit',
        source: 'compiler',
      },
    ])
  })

  test('parses cargo diagnostics with their following source location', () => {
    const diagnostics = parseLanguageDiagnostics({
      command: 'cargo clippy --all-targets',
      stderr: [
        'error[E0308]: mismatched types',
        '  --> src/lib.rs:12:9',
        '   |',
      ].join('\n'),
    })

    expect(diagnostics).toMatchObject([
      {
        file: 'src/lib.rs',
        range: { start: { line: 12, column: 9 } },
        severity: 'error',
        code: 'E0308',
        message: 'mismatched types',
        source: 'cargo',
      },
    ])
  })

  test('parses JVM, Python, PHPStan, and Godot output', () => {
    const cases = [
      {
        command: './gradlew check',
        stderr: 'e: file:///repo/src/App.kt:8:3 Unresolved reference: value',
        expected: { file: 'src/App.kt', source: 'kotlin', line: 8 },
      },
      {
        command: 'pyright',
        stdout:
          '/repo/app.py:3:5 - error: Unknown name (reportUndefinedVariable)',
        expected: { file: 'app.py', source: 'python', line: 3 },
      },
      {
        command: 'vendor/bin/phpstan analyse --error-format=raw',
        stdout: '/repo/src/App.php:19:Call to an undefined method',
        expected: { file: 'src/App.php', source: 'phpstan', line: 19 },
      },
      {
        command: 'godot --headless --editor --quit --path .',
        stderr:
          'SCRIPT ERROR: Parse Error: Expected expression.\n   at: GDScript::reload (res://scripts/player.gd:6)',
        expected: { file: 'scripts/player.gd', source: 'godot', line: 6 },
      },
    ]

    for (const item of cases) {
      const [diagnostic] = parseLanguageDiagnostics({
        command: item.command,
        cwd: '/repo',
        stdout: item.stdout,
        stderr: item.stderr,
      })
      expect(diagnostic).toMatchObject({
        file: item.expected.file,
        source: item.expected.source,
        range: { start: { line: item.expected.line } },
      })
    }
  })

  test('does not turn unlocated log lines into diagnostics', () => {
    expect(
      parseLanguageDiagnostics({
        command: 'gradle check',
        stderr: 'Build failed because a task returned a non-zero exit code.',
      }),
    ).toEqual([])
  })
})
