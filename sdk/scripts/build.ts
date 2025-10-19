// Build script for @codebuff/sdk using Bun's bundler with dual package support
// Creates ESM + CJS bundles with TypeScript declarations

import { execSync } from 'child_process'
import { mkdir, cp, readFile, writeFile } from 'fs/promises'

async function build() {
  console.log('🧹 Cleaning dist directory...')
  execSync('rm -rf dist', { stdio: 'inherit' })

  await mkdir('./dist', { recursive: true })

  // Read external dependencies from package.json
  const pkg = JSON.parse(await Bun.file('./package.json').text())
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
    loader: {
      '.scm': 'text',
    },
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
    loader: {
      '.scm': 'text',
    },
  })

  console.log('📝 Generating and bundling TypeScript declarations...')
  try {
    execSync(
      'bunx dts-bundle-generator -o dist/index.d.ts --no-check --export-referenced-types=false src/index.ts',
      { stdio: 'inherit' },
    )

    // Fix duplicate imports in the generated file
    await fixDuplicateImports()
    console.log('  ✓ Created bundled type definitions')
  } catch (error) {
    console.warn('⚠ TypeScript declaration bundling failed:', error.message)
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
