#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/*
 * This entire script is to remove one console.log line from bun-pty.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function patchBunPty() {
  const bunPtyIndexPath = path.join(__dirname, '../../node_modules/bun-pty/dist/index.js')
  
  if (!fs.existsSync(bunPtyIndexPath)) {
    console.log('⚠️  bun-pty not found, skipping patch')
    return
  }

  try {
    let content = fs.readFileSync(bunPtyIndexPath, 'utf8')
    const originalContent = content
    
    // Remove the libPath console.log line
    content = content.replace(/^console\.log\("libPath", libPath\);?\s*$/m, '')
    
    if (content !== originalContent) {
      fs.writeFileSync(bunPtyIndexPath, content, 'utf8')
      console.log('✅ Patched bun-pty to remove libPath console.log')
    } else {
      console.log('ℹ️  bun-pty already patched or pattern not found')
    }
  } catch (error) {
    console.error('❌ Failed to patch bun-pty:', error.message)
  }
}

// Check if this script is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  patchBunPty()
}
