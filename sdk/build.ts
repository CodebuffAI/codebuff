// Build script for @codebuff/sdk using Bun's bundler with dual package support
// Creates ESM + CJS bundles with TypeScript declarations

import { execSync } from 'child_process'
import { mkdir, cp } from 'fs/promises'

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
  ]

  console.log('📦 Building ESM format...')
  await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    sourcemap: 'external',
    minify: false,
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
    sourcemap: 'external',
    minify: false,
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

  console.log('📝 Generating TypeScript declarations...')
  try {
    execSync('tsc -p tsconfig.build.json', { stdio: 'inherit' })
    await createSimpleIndexTypes()
  } catch (error) {
    console.warn('⚠ TypeScript declaration generation failed, continuing...')
  }

  console.log('📂 Copying WASM files for tree-sitter...')
  await copyWasmFiles()

  console.log('✅ Build complete!')
  console.log('  📄 dist/index.mjs (ESM)')
  console.log('  📄 dist/index.cjs (CJS)')
  console.log('  📄 dist/index.d.ts (Types)')
}

/**
 * Create a simple index.d.ts that re-exports from the generated types
 */
async function createSimpleIndexTypes() {
  try {
    const indexDeclaration = 'export * from "./sdk/src/index";\n'
    await Bun.write('dist/index.d.ts', indexDeclaration)
    console.log('  ✓ Created simple re-export types')
  } catch (error) {
    console.warn('  ⚠ Warning: Could not create index types:', error.message)
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

if (import.meta.main) {
  build().catch(console.error)
}
