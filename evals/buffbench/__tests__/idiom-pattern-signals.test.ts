import { describe, expect, test } from 'bun:test'

import {
  detectIdiomPatternSignals,
  languageForDiffPath,
  normalizeDiffPath,
} from '../idiom-pattern-signals'

describe('idiom pattern signals', () => {
  test('detects conservative Python non-idioms in added diff lines', () => {
    const findings = detectIdiomPatternSignals(`diff --git a/tool.py b/tool.py
@@ -1,2 +1,5 @@
 import os
+path = os.path.join(root, "data.txt")
+handle = open(path)
+items.append(value)
 with open("ok.txt") as handle:
`)

    expect(findings.map((finding) => finding.patternId)).toEqual([
      'python-os-path-join',
      'python-manual-open-close',
      'python-list-append-loop',
    ])
    expect(findings[0]).toMatchObject({
      language: 'python',
      path: 'tool.py',
      lineNumber: 2,
    })
  })

  test('detects conservative Rust non-idioms in added diff lines', () => {
    const findings =
      detectIdiomPatternSignals(`diff --git a/src/lib.rs b/src/lib.rs
@@ -10,3 +10,6 @@ fn load() -> Result<String, Error> {
+let raw = std::fs::read_to_string(path).unwrap();
+let label = name.clone();
+let port = parse_port().expect("valid port");
 Ok(raw)
 }
`)

    expect(findings.map((finding) => finding.patternId)).toEqual([
      'rust-unwrap',
      'rust-unnecessary-clone',
      'rust-expect',
    ])
    expect(findings.every((finding) => finding.language === 'rust')).toBe(true)
  })

  test('detects conservative Go non-idioms in added diff lines', () => {
    const findings =
      detectIdiomPatternSignals(`diff --git a/server.go b/server.go
@@ -20,4 +20,7 @@ func load() error {
+value, _ := strconv.Atoi(raw)
+if err != nil { panic(err) }
+return fmt.Errorf("load config: %v", err)
 return nil
 }
`)

    expect(findings.map((finding) => finding.patternId)).toEqual([
      'go-discarded-error',
      'go-panic-error-path',
      'go-errorf-missing-wrap',
    ])
    expect(findings[2]).toMatchObject({
      language: 'go',
      lineNumber: 22,
    })
  })

  test('ignores removed lines, unsupported files, and idiomatic alternatives', () => {
    const findings = detectIdiomPatternSignals(`diff --git a/tool.py b/tool.py
@@ -1,6 +1,6 @@
-old = os.path.join(root, "data.txt")
+path = root / "data.txt"
+with path.open() as handle:
+    rows = [parse(row) for row in handle]
diff --git a/src/lib.rs b/src/lib.rs
@@ -1,4 +1,5 @@
-let raw = read().unwrap();
+let raw = read()?;
+let label = name.as_str();
diff --git a/server.go b/server.go
@@ -1,4 +1,5 @@
-return fmt.Errorf("load: %v", err)
+return fmt.Errorf("load: %w", err)
diff --git a/readme.md b/readme.md
@@ -1 +1,2 @@
+panic(err)
`)

    expect(findings).toEqual([])
  })

  test('normalizes paths and maps supported extensions', () => {
    expect(normalizeDiffPath('.\\src\\main.rs')).toBe('src/main.rs')
    expect(languageForDiffPath('cmd/server.go')).toBe('go')
    expect(languageForDiffPath('README.md')).toBeUndefined()
  })
})
