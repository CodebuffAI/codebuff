import { describe, expect, test } from 'bun:test'

import {
  patchOpenTuiLegacyNativeLoaderSource,
  restoreOpenTuiNativeLoaderSource,
} from '../../scripts/open-tui-legacy-patch'

const PLATFORM_LOADER = `
// src/zig.ts
var module = await import(\`@opentui/core-\${process.platform}-\${process.arch}/index.ts\`);
var targetLibPath = module.default;
if (!existsSync(targetLibPath)) throw new Error("unsupported");
`

describe('legacy OpenTUI bundle patch', () => {
  test('replaces the runtime platform import with the sibling dylib path', () => {
    const patched = patchOpenTuiLegacyNativeLoaderSource(PLATFORM_LOADER)

    expect(patched).not.toContain('@opentui/core-')
    expect(patched).not.toContain('await import')
    expect(patched).toContain('process.execPath.lastIndexOf("/")')
    expect(patched).toContain('"libopentui.dylib"')
    expect(patched).toContain('if (!existsSync(targetLibPath))')
  })

  test('fails closed when the expected OpenTUI loader changes', () => {
    expect(() =>
      patchOpenTuiLegacyNativeLoaderSource('var unrelated = 1'),
    ).toThrow('Expected exactly one OpenTUI platform loader, found 0')
  })

  test('fails closed instead of patching an ambiguous bundle', () => {
    expect(() =>
      patchOpenTuiLegacyNativeLoaderSource(
        `${PLATFORM_LOADER}\n${PLATFORM_LOADER}`,
      ),
    ).toThrow('Expected exactly one OpenTUI platform loader, found 2')
  })

  test('restores the canonical loader after a legacy patch (round-trip)', () => {
    const patched = patchOpenTuiLegacyNativeLoaderSource(PLATFORM_LOADER)
    const restored = restoreOpenTuiNativeLoaderSource(patched)

    expect(restored).toContain('@opentui/core-')
    expect(restored).toContain('await import')
    expect(restored).not.toContain('process.execPath.lastIndexOf')
  })

  test('is a no-op on an unpatched (canonical) bundle', () => {
    expect(restoreOpenTuiNativeLoaderSource(PLATFORM_LOADER)).toBe(
      PLATFORM_LOADER,
    )
  })

  test('does not throw when the legacy loader is absent', () => {
    expect(() =>
      restoreOpenTuiNativeLoaderSource('var unrelated = 1'),
    ).not.toThrow()
  })
})
