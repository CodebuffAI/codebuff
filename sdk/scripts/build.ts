// Build script for @codebuff/sdk using Bun's bundler with dual package support
// Creates ESM + CJS bundles with TypeScript declarations

import { mkdir, cp, readFile, writeFile, rm } from 'fs/promises'
import Module from 'module'
import { delimiter, join } from 'path'

import { generateDtsBundle } from 'dts-bundle-generator'

const workspaceNodeModules = join(import.meta.dir, '..', 'node_modules')
const existingNodePath = process.env.NODE_PATH ?? ''
const nodePathEntries = existingNodePath
  ? new Set(existingNodePath.split(delimiter))
  : new Set<string>()

if (!nodePathEntries.has(workspaceNodeModules)) {
  nodePathEntries.add(workspaceNodeModules)
  process.env.NODE_PATH = Array.from(nodePathEntries).join(delimiter)
  const moduleWithInit = Module as unknown as { _initPaths?: () => void }
  moduleWithInit._initPaths?.()
}

async function build() {
  console.log('🧹 Cleaning dist directory...')
  await rm('dist', { recursive: true, force: true })

  await mkdir('./dist', { recursive: true })

  // Read external dependencies from package.json
  const pkgText = await Bun.file('./package.json').text()
  const pkg = JSON.parse(pkgText)
  const external = [
    // Only exclude actual npm dependencies, not workspace packages
    ...Object.keys(pkg.dependencies || {}).filter(
      (dep) => !dep.startsWith('@codebuff/'),
    ),
    // Add Node.js built-ins
    'fs',
    'path',
    'child_process',
    'os',
    'crypto',
    'stream',
    'util',
    'ws',
    'bufferutil',
    'utf-8-validate',
    'http',
    'https',
    'net',
    'tls',
    'url',
    'events',
  ]

  console.log('📦 Building ESM format...')
  await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    minify: false,
    sourcemap: 'linked',
    external,
    naming: '[dir]/index.mjs',
    env: 'NEXT_PUBLIC_*',
    loader: {
      '.scm': 'text',
    },
    plugins: [],
  })

  console.log('📦 Building CJS format...')
  await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'cjs',
    minify: false,
    sourcemap: 'linked',
    external,
    naming: '[dir]/index.cjs',
    define: {
      'import.meta.url': 'undefined',
      'import.meta': 'undefined',
    },
    env: 'NEXT_PUBLIC_*',
    loader: {
      '.scm': 'text',
    },
    plugins: [],
  })

  console.log('🩹 Patching broken export aliases (Bun bundler dedup workaround)...')
  await fixBrokenExportAliases('dist/index.mjs')
  await fixBrokenExportAliases('dist/index.cjs')

  console.log('📝 Generating and bundling TypeScript declarations...')
  try {
    const [bundle] = generateDtsBundle(
      [
        {
          filePath: 'src/index.ts',
          output: {
            exportReferencedTypes: false,
          },
          libraries: {
            // Treat all @codebuff/* workspace packages as external imports
            // so dts-bundle-generator doesn't fail on their internal relative imports
            importedLibraries: [
              '@codebuff/common',
              '@codebuff/agent-runtime',
              '@codebuff/code-map',
              '@codebuff/llm-providers',
            ],
          },
        },
      ],
      {
        preferredConfigPath: join(import.meta.dir, '..', 'tsconfig.build.json'),
      },
    )

    await writeFile('dist/index.d.ts', bundle)
    await fixDuplicateImports()
    console.log('  ✓ Created bundled type definitions')
  } catch (error) {
    console.error('❌ TypeScript declaration bundling failed:', error.message)
    process.exit(1)
  }

  console.log('📂 Copying WASM files for tree-sitter...')
  await copyWasmFiles()

  console.log('📂 Copying vendored ripgrep binaries...')
  await copyRipgrepVendor()

  console.log('✅ Build complete!')
  console.log('  📄 dist/index.mjs (ESM)')
  console.log('  📄 dist/index.cjs (CJS)')
  console.log('  📄 dist/index.d.ts (Types)')
}

/**
 * Workaround for a Bun.build (1.3.x) bundler bug.
 *
 * When the SDK's `src/index.ts` re-exports overlapping identifiers from many
 * sub-modules (e.g. `run`, `validateAgents`, `runTerminalCommand`), Bun's
 * deduplicator collapses duplicate copies in the body but emits an export
 * block that references the suffixed/renamed names (`run2`, `validateAgents3`,
 * `RETRYABLE_STATUS_CODES3`). The renamed identifiers don't exist in the
 * file, so any downstream bundler (esbuild via Convex, esbuild via Vite, etc.)
 * fails with "<name> is not declared in this file".
 *
 * This pass:
 *   1. Scans the bundle for top-level declarations (var/let/const/function/class).
 *   2. Walks the trailing `export { ... }` block.
 *   3. For each `xxxN as yyy,` line, replaces `xxxN` with the highest-numbered
 *      copy that actually exists in the body (or the unsuffixed `xxx` if that
 *      is the only copy). Drops `xxx as yyy,` to `xxx,` when xxx === yyy.
 *   4. For bare exports (`xxx,`) that aren't declared anywhere, drops them
 *      entirely (the symbol was tree-shaken or never made it in).
 *
 * The patched bundle exports the exact same public names as the broken one
 * would have if Bun had emitted it correctly. No SDK API change.
 */
async function fixBrokenExportAliases(filePath: string) {
  let content
  try {
    content = await readFile(filePath, 'utf-8')
  } catch (error) {
    console.warn(`  ⚠ Skipping patch for missing ${filePath}`)
    return
  }

  // Collect every top-level declaration's identifier.
  const declared = new Set()
  const declRegex =
    /^(?:var|let|const|function|class|async\s+function)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/gm
  for (const match of content.matchAll(declRegex)) {
    declared.add(match[1])
  }

  // Given a name like "validateAgents3", find the closest declared identifier:
  //   prefer the exact name; else walk down (validateAgents2, validateAgents); else null.
  function findExisting(local) {
    if (declared.has(local)) return local
    const m = local.match(/^([A-Za-z_$][A-Za-z0-9_$]*?)(\d+)$/)
    if (!m) return null
    const base = m[1]
    const num = parseInt(m[2], 10)
    for (let i = num - 1; i >= 1; i--) {
      const candidate = base + i
      if (declared.has(candidate)) return candidate
    }
    if (declared.has(base)) return base
    return null
  }

  let rewritten = 0
  let removed = 0

  // Only match the top-level ESM export block. We anchor to start of line with
  // no leading whitespace and require `export {` (NOT `module.exports = {`,
  // which would catch inline CJS-shim factories embedded inside the bundle).
  const blockRegex = /^export\s*\{\s*\n([\s\S]*?)\n\s*\};?/gm
  content = content.replace(blockRegex, (full, body) => {
    const lines = body.split('\n')
    const fixed = []
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      // `xxx as yyy,` (with optional trailing comma)
      const aliasMatch = line.match(
        /^([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*,?$/,
      )
      if (aliasMatch) {
        const local = aliasMatch[1]
        const alias = aliasMatch[2]
        const found = findExisting(local)
        if (!found) {
          removed++
          continue
        }
        if (found !== local) rewritten++
        if (found === alias) {
          fixed.push(`  ${found},`)
        } else {
          fixed.push(`  ${found} as ${alias},`)
        }
        continue
      }

      // bare export: `xxx,`
      const bareMatch = line.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*,?$/)
      if (bareMatch) {
        const name = bareMatch[1]
        if (declared.has(name)) {
          fixed.push(`  ${name},`)
        } else {
          // Try recovering a suffixed copy (e.g. body has `name2` but body's
          // export wrote `name` directly).
          const found = findExisting(name)
          if (found && found !== name) {
            fixed.push(`  ${found} as ${name},`)
            rewritten++
          } else {
            removed++
          }
        }
        continue
      }

      // Unknown line shape (object spread, comment, etc.) — keep as-is.
      fixed.push(rawLine)
    }
    return `export {\n${fixed.join('\n')}\n};`
  })

  if (rewritten > 0 || removed > 0) {
    await writeFile(filePath, content)
    console.log(
      `  ✓ Patched ${filePath} — ${rewritten} aliases rewritten, ${removed} broken exports dropped`,
    )
  } else {
    console.log(`  ✓ ${filePath} already clean (no broken aliases found)`)
  }
}

/**
 * Fix duplicate imports in the generated index.d.ts file
 */
async function fixDuplicateImports() {
  try {
    let content = await readFile('dist/index.d.ts', 'utf-8')

    // Remove any duplicate zod default imports (handle various whitespace)
    const zodDefaultImportRegex = /import\s+z\s+from\s+['"]zod\/v4['"];?\n?/g
    const zodNamedImportRegex =
      /import\s+\{\s*z\s*\}\s+from\s+['"]zod\/v4['"];?/

    // If we have both imports, remove all default imports and keep only the named one
    if (
      content.match(zodNamedImportRegex) &&
      content.match(zodDefaultImportRegex)
    ) {
      content = content.replace(zodDefaultImportRegex, '')
    }

    await writeFile('dist/index.d.ts', content)
    console.log('  ✓ Fixed duplicate imports in bundled types')
  } catch (error) {
    console.warn('  ⚠ Warning: Could not fix duplicate imports:', error.message)
  }
}

/**
 * Copy WASM files from @vscode/tree-sitter-wasm to shared dist/wasm directory
 */
async function copyWasmFiles() {
  const wasmSourceDir = '../node_modules/@vscode/tree-sitter-wasm/wasm'
  const wasmFiles = [
    'tree-sitter.wasm', // Main tree-sitter WASM file
    'tree-sitter-c-sharp.wasm',
    'tree-sitter-cpp.wasm',
    'tree-sitter-go.wasm',
    'tree-sitter-java.wasm',
    'tree-sitter-javascript.wasm',
    'tree-sitter-python.wasm',
    'tree-sitter-ruby.wasm',
    'tree-sitter-rust.wasm',
    'tree-sitter-tsx.wasm',
    'tree-sitter-typescript.wasm',
  ]

  // Create shared wasm directory
  await mkdir('dist/wasm', { recursive: true })

  // Copy each WASM file to shared directory only
  for (const wasmFile of wasmFiles) {
    try {
      await cp(`${wasmSourceDir}/${wasmFile}`, `dist/wasm/${wasmFile}`)
      console.log(`  ✓ Copied ${wasmFile}`)
    } catch (error) {
      console.warn(`  ⚠ Warning: Could not copy ${wasmFile}:`, error.message)
    }
  }
}

async function copyRipgrepVendor() {
  const vendorSrc = 'vendor/ripgrep'
  const vendorDest = 'dist/vendor/ripgrep'
  try {
    await mkdir(vendorDest, { recursive: true })
    await cp(vendorSrc, vendorDest, { recursive: true })
    console.log('  ✓ Copied vendored ripgrep binaries')
  } catch (e) {
    console.warn(
      '  ⚠ No vendored ripgrep found; skipping (use fetch-ripgrep.ts first)',
    )
  }
}

if (import.meta.main) {
  build().catch(console.error)
}
