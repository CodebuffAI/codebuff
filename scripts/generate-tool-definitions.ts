#!/usr/bin/env bun

import { execSync } from 'child_process'
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
      // User-style .agents directory in this repo; keep it aligned with the template.
      join(process.cwd(), '.agents/types/tools.ts'),
    ]

    for (const outputPath of outputPaths) {
      // Create the directory if it does not exist
      mkdirSync(dirname(outputPath), { recursive: true })

      writeFileSync(outputPath, content, 'utf8')
    }

    // Format the generated files with prettier
    console.log('🎨 Formatting generated files...')
    execSync(
      `npx prettier --write ${outputPaths.map((path) => `"${path}"`).join(' ')}`,
      { stdio: 'inherit' },
    )

    console.log('✅ Successfully generated tools.ts')
    for (const outputPath of outputPaths) {
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
