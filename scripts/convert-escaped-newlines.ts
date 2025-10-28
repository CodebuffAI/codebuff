#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * Script to convert escaped newline strings to template literals in .agents folder
 *
 * Algorithm:
 * 1. Find all TypeScript files in .agents folder
 * 2. For each file, find string properties that contain escaped newlines
 * 3. Escape any existing backticks in the string content
 * 4. Convert the string wrapper from quotes to backticks
 * 5. Replace \n with actual newlines
 */

async function convertFile(filePath: string): Promise<boolean> {
  console.log(`Processing: ${filePath}`)

  const content = await readFile(filePath, 'utf-8')
  let modified = false

  // Pattern to match string properties that contain escaped newlines
  // Matches: propertyName: 'string with \n' or propertyName: "string with \n"
  const stringWithNewlinesPattern =
    /(\w+):\s*(['"])((?:(?!\2)[^\\]|\\[\s\S])*)\2/g

  const newContent = content.replace(
    stringWithNewlinesPattern,
    (match, propertyName, quote, stringContent) => {
      // Only process if the string contains escaped newlines
      if (!stringContent.includes('\\n')) {
        return match
      }

      console.log(`  Converting property: ${propertyName}`)
      modified = true

      // Step 1: Escape any existing backticks in the string content
      let processedContent = stringContent.replace(/`/g, '\\`')

      // Step 2: Replace escaped newlines with actual newlines
      processedContent = processedContent.replace(/\\n/g, '\n')

      // Step 3: Convert to template literal
      return `${propertyName}: \`${processedContent}\``
    },
  )

  if (modified) {
    await writeFile(filePath, newContent, 'utf-8')
    console.log(`  ✅ Updated: ${filePath}`)
    return true
  } else {
    console.log(`  ⏭️  No changes needed: ${filePath}`)
    return false
  }
}

async function main() {
  const agentsDir = '.agents'

  try {
    const files = await readdir(agentsDir)
    const tsFiles = files.filter((file) => file.endsWith('.ts'))

    console.log(`Found ${tsFiles.length} TypeScript files in ${agentsDir}/`)

    let totalModified = 0

    for (const file of tsFiles) {
      const filePath = join(agentsDir, file)
      const wasModified = await convertFile(filePath)
      if (wasModified) {
        totalModified++
      }
    }

    console.log(`\n🎉 Conversion complete!`)
    console.log(`📊 Files processed: ${tsFiles.length}`)
    console.log(`✏️  Files modified: ${totalModified}`)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
