// Build script for @codebuff/sdk using Bun's bundler with splitting
// Creates structured output with separate chunks for better Node.js compatibility

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
    outdir: 'dist/esm',
    target: 'node',
    format: 'esm',
    sourcemap: 'external',
    minify: false,
    external,
    loader: {
      '.scm': 'text',
    },
  })

  console.log('📦 Building CJS format...')
  await Bun.build({
    entrypoints: ['src/index.ts'],
    outdir: 'dist/cjs',
    target: 'node',
    format: 'cjs',
    sourcemap: 'external',
    minify: false,
    external,
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
  } catch (error) {
    console.warn('⚠ TypeScript declaration generation failed, continuing...')
  }

  console.log('📦 Adding CJS package.json for proper CommonJS detection...')
  const cjsPackageJson = JSON.stringify({ type: 'commonjs' }, null, 2)
  await Bun.write('dist/cjs/package.json', cjsPackageJson)

  console.log('📂 Copying WASM files for tree-sitter...')
  await copyWasmFiles()

  console.log('✅ Build complete!')
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
