#!/usr/bin/env bun

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execSync } from 'child_process'

import { compileToolDefinitions } from '@codebuff/common/tools/compile-tool-definitions'

/**
 * Regenerates the tool-definitions.d.ts file from the current tool schemas.
 * This ensures the type definitions stay in sync with the actual tool parameters.
 */
function main() {
  console.log('🔧 Generating tool definitions...')

  try {
    const content = compileToolDefinitions()
    // Write to the templates path (common/src/templates/initial-agents-dir/types)
    const outputPath = join(
      process.cwd(),
      'common/src/templates/initial-agents-dir/types/tools.ts',
    )

    // Create the directory if it does not exist
    mkdirSync(dirname(outputPath), { recursive: true })

    writeFileSync(outputPath, content, 'utf8')

    // Format the generated file with prettier
    console.log('🎨 Formatting generated file...')
    execSync(`npx prettier --write "${outputPath}"`, { stdio: 'inherit' })

    console.log('✅ Successfully generated tools.ts')
    console.log(`📁 Output: ${outputPath}`)
  } catch (error) {
    console.error('❌ Failed to generate tool definitions:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
