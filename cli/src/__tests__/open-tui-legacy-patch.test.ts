import { describe, expect, test } from 'bun:test'

import { patchOpenTuiLegacyNativeLoaderSource } from '../../scripts/open-tui-legacy-patch'

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
})
