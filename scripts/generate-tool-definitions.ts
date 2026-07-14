#!/usr/bin/env bun

import { execFileSync, execSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

import { compileToolDefinitions } from '@codebuff/common/tools/compile-tool-definitions'

/**
 * Regenerates the tool-definitions.d.ts file from the current tool schemas.
 * This ensures the type definitions stay in sync with the actual tool parameters.
 */
function main() {
  console.log('🔧 Generating tool definitions...')

  try {
    const content = compileToolDefinitions()
    const outputPaths = [
      // Template copied into newly initialized agent directories.
      join(
        process.cwd(),
        'common/src/templates/initial-agents-dir/types/tools.ts',
      ),
      // Local agent package types used by this repo's built-in agents/tests.
      join(process.cwd(), 'agents/types/tools.ts'),
      // Developer-local starter agents use the same canonical tool surface.
      join(process.cwd(), '.agents/types/tools.ts'),
    ]

    const writtenPaths: string[] = []
    for (const outputPath of outputPaths) {
      // Create the directory if it does not exist
      try {
        mkdirSync(dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, content, 'utf8')
        writtenPaths.push(outputPath)
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : undefined
        if (code !== 'EROFS' && code !== 'EACCES') throw error
        console.warn(`⚠️ Skipping read-only generated mirror: ${outputPath}`)
      }
    }

    if (writtenPaths.length === 0) {
      throw new Error('No writable tool-definition output paths were available')
    }

    // Format the generated files with prettier
    console.log('🎨 Formatting generated files...')
    execSync(
      `npx prettier --write ${writtenPaths.map((path) => `"${path}"`).join(' ')}`,
      { stdio: 'inherit' },
    )

    // The CLI embeds the starter type files so compiled binaries can run
    // `openbuff init` without runtime text imports. Refresh that mirror in the
    // same canonical command so schema changes cannot leave CI-only drift.
    execFileSync('bun', ['cli/scripts/generate-init-type-sources.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    console.log('✅ Successfully generated tools.ts')
    for (const outputPath of writtenPaths) {
      console.log(`📁 Output: ${outputPath}`)
    }
  } catch (error) {
    console.error('❌ Failed to generate tool definitions:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
