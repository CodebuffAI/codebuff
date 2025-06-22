#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/*
 * This script patches web-tree-sitter to use inlined WASM data
 * instead of file system access for better binary compatibility.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function patchSingleFile(webTreeSitterPath: string, verbose: boolean): boolean {
  if (!fs.existsSync(webTreeSitterPath)) {
    if (verbose) {
      console.warn(
        `⚠️  web-tree-sitter not found at ${webTreeSitterPath}, skipping`
      )
    }
    return false
  }

  try {
    let content = fs.readFileSync(webTreeSitterPath, 'utf8')
    const originalContent = content

    if (verbose) {
      console.log(`Checking file at: ${webTreeSitterPath}`)
      console.log('File size:', content.length)
    }

    // Read and encode the WASM file as base64
    const wasmPath = path.join(
      __dirname,
      '../../node_modules/web-tree-sitter/tree-sitter.wasm'
    )
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`❌ Web-tree-sitter WASM file not found at ${wasmPath}`)
    }
    const wasmBuffer = fs.readFileSync(wasmPath)
    const wasmBase64 = wasmBuffer.toString('base64')

    // Check if already patched with the new version
    if (content.includes('CODEBUFF_PATCHED_FINDWASM_V3')) {
      if (verbose) {
        console.log('ℹ️  Already patched with new version')
      }
      return false
    }

    // Remove old patches completely - restore original file first
    // Reinstall the package to get a clean version
    if (verbose) {
      console.log('🔄 Removing old patches, reinstalling web-tree-sitter...')
    }
    const { execSync } = require('child_process')
    execSync('bun uninstall web-tree-sitter', {
      cwd: path.join(__dirname, '../..'),
      stdio: 'pipe',
    })
    execSync('bun install web-tree-sitter@0.25.6', {
      cwd: path.join(__dirname, '../../packages/code-map'),
      stdio: 'pipe',
    })

    // Re-read the clean file
    content = fs.readFileSync(webTreeSitterPath, 'utf8')

    // Add global WASM data at the top of the file
    const globalWasmData = `
// CODEBUFF_PATCHED_GLOBAL_WASM
var CODEBUFF_INLINED_WASM_DATA = "${wasmBase64}";
var CODEBUFF_WASM_BINARY = null;
`

    // Insert the global data after the first line
    const lines = content.split('\n')
    lines.splice(1, 0, globalWasmData)
    content = lines.join('\n')

    // Track replacement success
    const replacements = []

    // Patch pattern for readFileSync
    const readPattern =
      'var ret = fs.readFileSync(filename, binary2 ? void 0 : "utf8");'
    const readReplacement = `/*CODEBUFF_PATCHED*/var ret; if(typeof Bun!=="undefined"&&binary2&&filename.includes("tree-sitter.wasm")&&typeof CODEBUFF_INLINED_WASM_DATA!=="undefined"){ret=new Uint8Array(Buffer.from(CODEBUFF_INLINED_WASM_DATA,"base64"));}else{ret=fs.readFileSync(filename, binary2 ? void 0 : "utf8");}`

    const newContent1 = content.replace(readPattern, readReplacement)
    replacements.push({
      name: 'readFileSync patch',
      success: newContent1 !== content,
    })
    content = newContent1

    // Patch the getBinarySync function to use our inlined data
    const getBinarySyncPattern =
      /function getBinarySync\(file\) \{\s*if \(file == wasmBinaryFile && wasmBinary\) \{\s*return new Uint8Array\(wasmBinary\);\s*\}/
    const getBinarySyncReplacement = `function getBinarySync(file) {
      /*CODEBUFF_PATCHED_GETBINARY*/
      if (typeof Bun !== "undefined" && typeof CODEBUFF_INLINED_WASM_DATA !== "undefined") {
        if (!CODEBUFF_WASM_BINARY) {
          CODEBUFF_WASM_BINARY = new Uint8Array(Buffer.from(CODEBUFF_INLINED_WASM_DATA, "base64"));
        }
        return CODEBUFF_WASM_BINARY;
      }
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }`

    const newContent2 = content.replace(
      getBinarySyncPattern,
      getBinarySyncReplacement
    )
    replacements.push({
      name: 'getBinarySync patch',
      success: newContent2 !== content,
    })
    content = newContent2

    // Patch pattern for findWasmBinary function - simplified approach
    const findWasmPattern =
      /function findWasmBinary\(\) \{\s*if \(Module\["locateFile"\]\) \{\s*return locateFile\("tree-sitter\.wasm"\);\s*\}\s*return new URL\("tree-sitter\.wasm", import\.meta\.url\)\.href;\s*\}/
    const findWasmReplacement = `function findWasmBinary() {
      /*CODEBUFF_PATCHED_FINDWASM_V3*/
      if (typeof Bun !== "undefined" && typeof CODEBUFF_INLINED_WASM_DATA !== "undefined") {
        // Set wasmBinary directly so getBinarySync can use it
        if (!CODEBUFF_WASM_BINARY) {
          CODEBUFF_WASM_BINARY = Buffer.from(CODEBUFF_INLINED_WASM_DATA, "base64");
        }
        wasmBinary = CODEBUFF_WASM_BINARY;
        wasmBinaryFile = "tree-sitter.wasm";
        return "tree-sitter.wasm";
      }
      if (Module["locateFile"]) {
        return locateFile("tree-sitter.wasm");
      }
      return new URL("tree-sitter.wasm", import.meta.url).href;
    }`

    const newContent3 = content.replace(findWasmPattern, findWasmReplacement)
    replacements.push({
      name: 'findWasmBinary patch',
      success: newContent3 !== content,
    })
    content = newContent3

    // Check if all replacements were successful
    const failedReplacements = replacements.filter((r) => !r.success)

    if (content !== originalContent) {
      fs.writeFileSync(webTreeSitterPath, content, 'utf8')
      if (verbose) {
        console.log('✅ Patched successfully with inlined WASM data')
        if (failedReplacements.length > 0) {
          console.warn(
            `⚠️  Some patches failed: ${failedReplacements.map((r) => r.name).join(', ')}`
          )
        }
      }
      return true
    } else {
      if (verbose) {
        console.log(
          '⚠️  No changes made - all patterns may have failed to match'
        )
        console.log(
          `Failed replacements: ${failedReplacements.map((r) => r.name).join(', ')}`
        )
      }
      return false
    }
  } catch (error) {
    console.error(`❌ Failed to patch ${webTreeSitterPath}:`, error.message)
    return false
  }
}

export function patchWebTreeSitter(verbose = false) {
  // Only patch root node_modules (hoisted)
  const webTreeSitterPath = path.join(
    __dirname,
    '../../node_modules/web-tree-sitter/tree-sitter.js'
  )

  let patchedCount = 0
  if (patchSingleFile(webTreeSitterPath, verbose)) {
    patchedCount++
  }

  if (verbose) {
    console.log(`✅ Patched ${patchedCount} web-tree-sitter file(s)`)
  }
}

// Check if this script is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  patchWebTreeSitter(true)
}
