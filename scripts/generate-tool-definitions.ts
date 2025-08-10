#!/usr/bin/env bun

import { writeFileSync } from 'fs'
import { join } from 'path'
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
    const outputPath = join(process.cwd(), 'common/src/util/types/tools.d.ts')

    writeFileSync(outputPath, content, 'utf8')

    // Format the generated file with prettier
    console.log('🎨 Formatting generated file...')
    execSync(`npx prettier --write "${outputPath}"`, { stdio: 'inherit' })

    console.log('✅ Successfully generated tools.d.ts')
    console.log(`📁 Output: ${outputPath}`)
  } catch (error) {
    console.error('❌ Failed to generate tool definitions:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
