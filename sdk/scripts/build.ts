// Build script for @openbuff/sdk using Bun's bundler with dual package support
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
    // Disable env inlining so the published bundle uses runtime `process.env.X`
    // lookups with source-code defaults, not build-time values that could leak
    // local dev config (e.g. support email) into the npm package.
    env: false,
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
    // Disable env inlining so the published bundle uses runtime `process.env.X`
    // lookups with source-code defaults, not build-time values that could leak
    // local dev config (e.g. support email) into the npm package.
    env: false,
    loader: {
      '.scm': 'text',
    },
    plugins: [],
  })

  console.log('📝 Generating and bundling TypeScript declarations...')
  try {
    const [bundle] = generateDtsBundle(
      [
        {
          filePath: 'src/index.ts',
          output: {
            exportReferencedTypes: false,
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

  // Work around Bun CJS bundler bug: some `export { X } from './module'`
  // statements produce export getters referencing `import_X.Y` but drop the
  // `var import_X = ...` declaration, causing "import_X is not defined" at
  // runtime. This patches the CJS bundle to replace those broken references.
  await fixCjsImportVars()

  console.log('✅ Build complete!')
  console.log('  📄 dist/index.mjs (ESM)')
  console.log('  📄 dist/index.cjs (CJS)')
  console.log('  📄 dist/index.d.ts (Types)')
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
    console.warn(
      '  ⚠ Warning: Could not fix duplicate imports:',
      error.message,
    )
  }
}

/**
 * Work around Bun CJS bundler bug: `export { X } from './module'` can produce
 * export getters referencing `import_module.X` but drop the `var import_module
 * = ...` declaration, causing "import_module is not defined" at runtime.
 *
 * This post-build fixup scans the CJS bundle for export getters that reference
 * undeclared `import_*` variables and replaces them with direct symbol
 * references (function names, constants, or the module's internal `exports_*`
 * object).
 */
async function fixCjsImportVars() {
  const cjsPath = 'dist/index.cjs'
  let content = await readFile(cjsPath, 'utf-8')

  // Step 1: Find all declared `var import_*` variables.
  const declaredImports = new Set<string>()
  const varDeclRegex = /var\s+(import_\w+)/g
  let match: RegExpExecArray | null
  while ((match = varDeclRegex.exec(content)) !== null) {
    declaredImports.add(match[1])
  }

  // Step 2: Find all `import_*.Y` patterns in export getters.
  // Match: `exportName: () => import_module.symbolName,`
  const getterRegex =
    /(\w+):\s*\(\)\s*=>\s*(import_\w+)\.(\w+)/g
  const replacements: { from: string; to: string }[] = []
  const brokenVars = new Set<string>()

  while ((match = getterRegex.exec(content)) !== null) {
    const importVar = match[2]
    if (!declaredImports.has(importVar)) {
      brokenVars.add(importVar)
    }
  }

  if (brokenVars.size === 0) {
    console.log('  ✓ CJS import vars fixup: no broken references found')
    return
  }

  // Step 3: For each broken import_* variable, find the corresponding
  // internal `exports_*` object and build a replacement map.
  // The pattern in the CJS bundle is:
  //   var exports_<name> = {};
  //   __export(exports_<name>, { ... symbolName: () => symbolName, ... });
  // And the broken getter is:
  //   exportName: () => import_<name>.symbolName,
  //
  // We need to map `import_<name>.symbolName` -> `exports_<name>.symbolName`
  // where `<name>` is derived from the import variable name.
  // `import_code_map` -> `exports_src` (code-map's index.ts)
  // `import_code_map_exports` -> `exports_src` (our wrapper)
  // `import_validate_agents2` -> `exports_validate_agents`
  // etc.
  //
  // Rather than guessing the mapping, we look for `exports_*` objects that
  // contain the same symbol names.

  // Build a map: symbolName -> exports_varName for all __export calls.
  // Skip the main SDK export object (the one that has `module.exports =
  // __toCommonJS(exports_*)`) — that's the object we're fixing, not a source.
  // Identify it by finding the `module.exports = __toCommonJS(exports_X)` line.
  const moduleExportsRegex = /module\.exports\s*=\s*__toCommonJS\((exports_\w+)\)/
  const moduleExportsMatch = content.match(moduleExportsRegex)
  const mainExportVar = moduleExportsMatch ? moduleExportsMatch[1] : 'exports_src2'

  const exportObjRegex =
    /var\s+(exports_\w+)\s*=\s*\{\s*\}[;]?\s*\n__export\(\s*\1\s*,\s*\{([\s\S]*?)\}\)/g
  const symbolToExports = new Map<string, string>()

  while ((match = exportObjRegex.exec(content)) !== null) {
    const exportsVar = match[1]
    // Skip the main SDK export object — it's the one we're fixing
    if (exportsVar === mainExportVar) continue
    const body = match[2]
    const symRegex = /(\w+):\s*\(\)\s*=>\s*/g
    let symMatch: RegExpExecArray | null
    while ((symMatch = symRegex.exec(body)) !== null) {
      // Only set if not already mapped (prefer first/internal module definitions)
      if (!symbolToExports.has(symMatch[1])) {
        symbolToExports.set(symMatch[1], exportsVar)
      }
    }
  }

  // Step 4: Replace broken `import_*.symbolName` with `exports_*.symbolName`
  for (const brokenVar of brokenVars) {
    // Find all getters referencing this broken var
    const brokenGetterRegex = new RegExp(
      `(\\w+):\\s*\\(\\)\\s*=>\\s*${brokenVar}\.(\\w+)`,
      'g',
    )
    let bgMatch: RegExpExecArray | null
    while ((bgMatch = brokenGetterRegex.exec(content)) !== null) {
      const exportName = bgMatch[1]
      const symbolName = bgMatch[2]
      const exportsVar = symbolToExports.get(symbolName)
      if (exportsVar) {
        const from = `${bgMatch[0]}`
        const to = `${exportName}: () => ${exportsVar}.${symbolName}`
        replacements.push({ from, to })
      } else {
        // Try direct function/variable reference
        // Check if `function symbolName` or `var symbolName` exists in the bundle
        const fnRegex = new RegExp(
          `^(?:async\\s+)?function\\s+${symbolName}\\b`,
          'm',
        )
        const varRegex = new RegExp(`var\\s+${symbolName}\\b`)
        let directRef: string | null = null
        if (fnRegex.test(content)) {
          directRef = symbolName
        } else if (varRegex.test(content)) {
          directRef = symbolName
        }
        if (directRef) {
          replacements.push({
            from: bgMatch[0],
            to: `${exportName}: () => ${directRef}`,
          })
        } else {
          console.warn(
            `    ⚠ Could not find replacement for ${brokenVar}.${symbolName}`,
          )
        }
      }
    }
  }

  // Step 5: Apply replacements
  let fixCount = 0
  for (const { from, to } of replacements) {
    if (content.includes(from)) {
      content = content.replace(from, to)
      fixCount++
    }
  }

  await writeFile(cjsPath, content)
  console.log(
    `  ✓ CJS import vars fixup: replaced ${fixCount} broken export getters (for ${brokenVars.size} undeclared import_* vars)`,
  )
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
    'tree-sitter-kotlin.wasm',
    'tree-sitter-php.wasm',
    'tree-sitter-swift.wasm',
    'tree-sitter-gdscript.wasm',
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
