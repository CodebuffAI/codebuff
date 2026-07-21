const OPEN_TUI_PLATFORM_IMPORT =
  /var module = await import\(`@opentui\/core-\$\{process\.platform\}-\$\{process\.arch\}\/index\.ts`\);\s*var targetLibPath = module\.default;/g

const LEGACY_NATIVE_LOADER = `var targetLibPath = process.execPath.slice(0, process.execPath.lastIndexOf("/") + 1) + "libopentui.dylib";`

/**
 * Bun 1.0 does not bundle OpenTUI's template-literal platform import into a
 * standalone executable. Legacy macOS releases ship a macOS 11-compatible
 * libopentui.dylib next to the executable, so make that path explicit before
 * invoking the legacy compiler.
 */
export function patchOpenTuiLegacyNativeLoaderSource(source: string): string {
  const matches = source.match(OPEN_TUI_PLATFORM_IMPORT) ?? []
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one OpenTUI platform loader, found ${matches.length}`,
    )
  }

  return source.replace(OPEN_TUI_PLATFORM_IMPORT, LEGACY_NATIVE_LOADER)
}

const CANONICAL_NATIVE_LOADER =
  'var module = await import(`@opentui/core-${process.platform}-${process.arch}/index.ts`);\n' +
  'var targetLibPath = module.default;'

/**
 * Reverts a stale legacy patch left in a shared/cached node_modules so the
 * non-legacy build compiles OpenTUI's canonical platform loader.
 */
export function restoreOpenTuiNativeLoaderSource(source: string): string {
  if (!source.includes(LEGACY_NATIVE_LOADER)) return source
  return source.replace(LEGACY_NATIVE_LOADER, CANONICAL_NATIVE_LOADER)
}
