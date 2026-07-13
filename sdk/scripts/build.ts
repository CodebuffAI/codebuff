// Build script for @openbuff/sdk using Bun's bundler with dual package support
// Creates ESM + CJS bundles with TypeScript declarations

import { mkdir, cp, readFile, writeFile, rm } from 'fs/promises'
import { createHash } from 'crypto'
import Module from 'module'
import { delimiter, join, resolve } from 'path'

import { generateDtsBundle } from 'dts-bundle-generator'
import { resolveGrammarWasmSource } from '../../packages/code-map/src/grammar-wasm-repair'
import { LANGUAGE_WASM_FILES } from '../../packages/code-map/src/wasm-files'

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
    treeShaking: false,
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
    treeShaking: false,
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

  // Work around Bun ESM bundler bug: some re-exports produce dedup renames
  // like `X2 as X` where `X2` is not defined as a variable in the bundle,
  // causing "Export 'X2' is not defined in module" at runtime. This patches
  // the ESM bundle to replace broken `X2 as X` with just `X`.
  await fixEsmExportRenames()

  // Work around Bun bundler tree-shaking: the `ToolHelpers` aggregation object
  // (from `sdk/src/tools/index.ts`) is only re-exported, never used internally,
  // so even with `treeShaking: false` the bundler strips its definition. The
  // individual tool functions ARE bundled (they're used by `sdk/src/run.ts`).
  // This step reconstructs `ToolHelpers` from those already-bundled functions
  // and adds it to the export block.
  await fixToolHelpers()

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
    console.warn('  ⚠ Warning: Could not fix duplicate imports:', error.message)
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
  const getterRegex = /(\w+):\s*\(\)\s*=>\s*(import_\w+)\.(\w+)/g
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
  const moduleExportsRegex =
    /module\.exports\s*=\s*__toCommonJS\((exports_\w+)\)/
  const moduleExportsMatch = content.match(moduleExportsRegex)
  const mainExportVar = moduleExportsMatch
    ? moduleExportsMatch[1]
    : 'exports_src2'

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
 * Work around Bun ESM bundler bugs:
 *
 * 1. Dedup renames: `X2 as X` where `X2` is never defined in the bundle
 *    but the original `X` IS defined. Fix: replace `X2 as X` with just `X`.
 *
 * 2. Tree-shaken exports: symbols that appear in the export block but were
 *    stripped from the bundle body entirely (neither the symbol nor any
 *    suffixed variant is defined). Fix: remove the export entry from the
 *    export block to prevent `Export is not defined` errors.
 */
async function fixEsmExportRenames() {
  const esmPath = 'dist/index.mjs'
  let content = await readFile(esmPath, 'utf-8')

  // Step 1: Find all declared variables/functions/classes in the bundle.
  const declared = new Set<string>()
  const declRegex =
    /^(?:var|let|const)\s+(\w+)|^(?:async\s+)?function\*?\s+(\w+)|^class\s+(\w+)/gm
  let match: RegExpExecArray | null
  while ((match = declRegex.exec(content)) !== null) {
    const name = match[1] || match[2] || match[3]
    if (name) declared.add(name)
  }

  // Step 2: Find the final `export { ... }` block at the end of the file.
  const exportBlockRegex = /export\s*\{([\s\S]*?)\}/g
  let lastExportBlock = ''
  while ((match = exportBlockRegex.exec(content)) !== null) {
    lastExportBlock = match[1]
  }

  if (!lastExportBlock) {
    console.log('  ✓ ESM export renames fixup: no export block found')
    return
  }

  // Step 3: Parse each export entry and classify.
  // Entries can be:
  //   - `symbolName` (bare)
  //   - `X2 as symbolName` (dedup rename)
  //   - `X as Y` (legitimate rename, e.g. OpenbuffClient as CodebuffClient)
  const entryRegex = /(\w+)(\d+)?\s+as\s+(\w+)|(\w+)(?=\s*[,\n}])/g
  const renames: { from: string; to: string }[] = []
  const removals: string[] = []

  while ((match = entryRegex.exec(lastExportBlock)) !== null) {
    let localName: string
    let exportedName: string
    let hasRename = false

    if (match[3]) {
      // Pattern: `X2 as Y` or `X as Y`
      localName = match[1] + (match[2] || '') // e.g. MAX_RETRIES_PER_MESSAGE2
      exportedName = match[3] // e.g. MAX_RETRIES_PER_MESSAGE
      hasRename = true
    } else {
      // Pattern: `symbolName` (bare)
      localName = match[4]
      exportedName = localName
    }

    // If the local variable exists, this export is fine.
    if (declared.has(localName)) continue

    if (hasRename) {
      // `X2 as X` where X2 is not declared
      if (declared.has(exportedName)) {
        // Dedup rename: X is defined, X2 is not. Fix: replace with X.
        renames.push({
          from: `${localName} as ${exportedName}`,
          to: exportedName,
        })
      } else {
        // Neither X2 nor X is defined — tree-shaken. Remove the entry.
        removals.push(`${localName} as ${exportedName}`)
      }
    } else {
      // Bare export `X` where X is not declared — tree-shaken. Remove it.
      removals.push(localName)
    }
  }

  if (renames.length === 0 && removals.length === 0) {
    console.log('  ✓ ESM export renames fixup: no broken exports found')
    return
  }

  // Step 4: Apply dedup rename fixes.
  let fixCount = 0
  for (const { from, to } of renames) {
    if (content.includes(from)) {
      content = content.replace(from, to)
      fixCount++
    }
  }

  // Step 5: Rebuild the export block to remove tree-shaken entries.
  // Parse the export block into lines, filter out removed entries, and
  // reconstruct a clean export statement.
  const exportLines = lastExportBlock
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== ',' && l !== '}')

  const removalSet = new Set(removals)
  const renameMap = new Map(renames.map((r) => [r.from, r.to]))
  const keptEntries: string[] = []
  let removalCount = 0

  for (const line of exportLines) {
    const clean = line.replace(/,$/, '').trim()
    if (!clean) continue
    if (removalSet.has(clean)) {
      removalCount++
      continue
    }
    const renamed = renameMap.get(clean)
    if (renamed !== undefined) {
      keptEntries.push(renamed)
      continue // already counted as fixCount above
    }
    keptEntries.push(clean)
  }

  // Rebuild the export block and replace the last `export { ... }`.
  const newExportBlock = keptEntries.map((e) => `  ${e},`).join('\n')
  const newExportStatement = `export {\n${newExportBlock}\n}`
  const lastExportRegex = /export\s*\{[\s\S]*?\}([\s\S]*)$/
  content = content.replace(lastExportRegex, `${newExportStatement}$1`)

  await writeFile(esmPath, content)
  const rMsg = fixCount > 0 ? `replaced ${fixCount} dedup renames` : ''
  const dMsg =
    removalCount > 0 ? `removed ${removalCount} tree-shaken exports` : ''
  const summary = [rMsg, dMsg].filter(Boolean).join(', ')
  console.log(`  ✓ ESM export renames fixup: ${summary}`)
}

/**
 * Work around Bun bundler tree-shaking of the `ToolHelpers` aggregation object.
 *
 * `ToolHelpers` is defined in `sdk/src/tools/index.ts` as an object literal
 * aggregating individual tool functions. It is only re-exported from the SDK
 * entry point, never used internally, so even with `treeShaking: false` the
 * bundler strips its definition entirely. The individual tool functions ARE
 * bundled (they're used by `sdk/src/run.ts`), so we reconstruct `ToolHelpers`
 * from those already-bundled functions and add it to the export block.
 */
async function fixToolHelpers() {
  const toolHelpersDef =
    'var ToolHelpers = { runTerminalCommand, codeSearch, findFilesMatchingContent, glob, listDirectory, getFiles, getFilesStructured, replaceRange, runFileChangeHooks, changeFile };'

  // --- ESM bundle ---
  const esmPath = 'dist/index.mjs'
  let esmContent = await readFile(esmPath, 'utf-8')

  // Only inject if ToolHelpers is not already defined as a variable.
  if (!/^var\s+ToolHelpers\b/m.test(esmContent)) {
    // Insert the ToolHelpers definition right before the final export block.
    const lastExportIdx = esmContent.lastIndexOf('\nexport {')
    if (lastExportIdx !== -1) {
      const insertPos = lastExportIdx + 1 // start after the newline
      esmContent =
        esmContent.slice(0, insertPos) +
        toolHelpersDef +
        '\n' +
        esmContent.slice(insertPos)

      // Add `ToolHelpers` to the export block if it's not already there.
      // Find the closing `}` of the export block by counting braces.
      const exportStart = esmContent.indexOf(
        '{',
        insertPos + toolHelpersDef.length,
      )
      if (exportStart !== -1) {
        let depth = 0
        let exportEnd = -1
        for (let i = exportStart; i < esmContent.length; i++) {
          if (esmContent[i] === '{') depth++
          else if (esmContent[i] === '}') {
            depth--
            if (depth === 0) {
              exportEnd = i
              break
            }
          }
        }
        if (exportEnd !== -1) {
          const exportBlockContent = esmContent.slice(exportStart, exportEnd)
          if (!/\bToolHelpers\b/.test(exportBlockContent)) {
            esmContent =
              esmContent.slice(0, exportEnd) +
              '  ToolHelpers,\n' +
              esmContent.slice(exportEnd)
          }
        }
      }
    }
    await writeFile(esmPath, esmContent)
  }

  // --- CJS bundle ---
  const cjsPath = 'dist/index.cjs'
  let cjsContent = await readFile(cjsPath, 'utf-8')

  // Only inject if ToolHelpers is not already defined as a variable.
  if (!/^var\s+ToolHelpers\b/m.test(cjsContent)) {
    // Insert the ToolHelpers definition on its own line before the first
    // `__esm` wrapper. Ensure we start at a line boundary to avoid
    // concatenating with partial tokens on the previous line.
    let insertIdx = cjsContent.indexOf('__esm')
    if (insertIdx === -1) {
      // Fallback: insert before the broken getter reference.
      insertIdx = cjsContent.indexOf('ToolHelpers: () => import_tools.')
    }
    if (insertIdx !== -1) {
      // Walk back to the start of the line to avoid mid-line insertion.
      while (insertIdx > 0 && cjsContent[insertIdx - 1] !== '\n') {
        insertIdx--
      }
      cjsContent =
        cjsContent.slice(0, insertIdx) +
        toolHelpersDef +
        '\n' +
        cjsContent.slice(insertIdx)

      // Fix the broken getter: replace `import_tools.ToolHelpers` (or any
      // `import_X.ToolHelpers` reference) with just `ToolHelpers`.
      cjsContent = cjsContent.replace(
        /ToolHelpers:\s*\(\)\s*=>\s*import_\w+\.ToolHelpers/g,
        'ToolHelpers: () => ToolHelpers',
      )
    }
    await writeFile(cjsPath, cjsContent)
  }

  console.log('  ✓ ToolHelpers reconstruction: injected aggregation object')
}

/**
 * Copy every advertised language grammar to the shared dist/wasm directory.
 */
async function copyWasmFiles() {
  const wasmFiles = ['tree-sitter.wasm', ...LANGUAGE_WASM_FILES]
  const wasmDir = resolve('dist/wasm')

  // Create shared wasm directory
  await mkdir(wasmDir, { recursive: true })

  const manifest: Record<string, string> = {}
  for (const wasmFile of wasmFiles) {
    const sourceName =
      wasmFile === 'tree-sitter-c-sharp.wasm'
        ? 'tree-sitter-c_sharp.wasm'
        : wasmFile
    const candidates =
      wasmFile === 'tree-sitter.wasm'
        ? [`../node_modules/web-tree-sitter/${wasmFile}`]
        : [
            `../node_modules/tree-sitter-wasms/out/${sourceName}`,
            `../node_modules/@vscode/tree-sitter-wasm/wasm/${wasmFile}`,
          ]
    const source =
      wasmFile === 'tree-sitter.wasm'
        ? candidates.find((candidate) => Bun.file(candidate).size > 0)
        : await resolveGrammarWasmSource({
            wasmFile,
            candidates,
            repairDir: wasmDir,
          })
    if (!source)
      throw new Error(
        `Missing required tree-sitter asset ${wasmFile}; searched ${candidates.join(', ')}`,
      )
    const bytes = await readFile(source)
    const target = join(wasmDir, wasmFile)
    if (resolve(source) !== target) await cp(source, target)
    manifest[wasmFile] = createHash('sha256').update(bytes).digest('hex')
    console.log(`  ✓ Copied ${wasmFile}`)
  }
  await writeFile(
    join(wasmDir, 'tree-sitter-manifest.json'),
    `${JSON.stringify({ schemaVersion: 1, files: manifest }, null, 2)}\n`,
  )
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
  build().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
