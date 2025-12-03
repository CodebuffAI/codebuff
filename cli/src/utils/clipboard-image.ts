import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

export interface ClipboardImageResult {
  success: boolean
  imagePath?: string
  filename?: string
  error?: string
}

/**
 * Get a temp directory for clipboard images
 */
function getClipboardTempDir(): string {
  const tempDir = path.join(os.tmpdir(), 'codebuff-clipboard-images')
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }
  return tempDir
}

/**
 * Generate a unique filename for a clipboard image
 */
function generateImageFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `clipboard-${timestamp}.png`
}

/**
 * Check if clipboard contains an image (macOS)
 * Uses 'clipboard info' which is the fastest way to check clipboard types
 */
function hasImageMacOS(): boolean {
  try {
    const result = spawnSync('osascript', [
      '-e',
      'clipboard info',
    ], { encoding: 'utf-8', timeout: 1000 })
    
    if (result.status !== 0) {
      return false
    }
    
    const output = result.stdout || ''
    // Check for image types in clipboard info
    return output.includes('«class PNGf»') || 
           output.includes('TIFF') || 
           output.includes('«class JPEG»') ||
           output.includes('public.png') ||
           output.includes('public.tiff') ||
           output.includes('public.jpeg')
  } catch {
    return false
  }
}

/**
 * Read image from clipboard (macOS)
 */
function readImageMacOS(): ClipboardImageResult {
  try {
    const tempDir = getClipboardTempDir()
    const filename = generateImageFilename()
    const imagePath = path.join(tempDir, filename)
    
    // Try pngpaste first (if installed)
    const pngpasteResult = spawnSync('pngpaste', [imagePath], {
      encoding: 'utf-8',
      timeout: 5000,
    })
    
    if (pngpasteResult.status === 0 && existsSync(imagePath)) {
      return { success: true, imagePath, filename }
    }
    
    // Fallback: use osascript to save clipboard image
    const script = `
      set thePath to "${imagePath}"
      try
        set imageData to the clipboard as «class PNGf»
        set fileRef to open for access thePath with write permission
        write imageData to fileRef
        close access fileRef
        return "success"
      on error
        try
          set imageData to the clipboard as TIFF picture
          -- Convert TIFF to PNG using sips
          set tiffPath to "${imagePath}.tiff"
          set fileRef to open for access tiffPath with write permission
          write imageData to fileRef
          close access fileRef
          do shell script "sips -s format png " & quoted form of tiffPath & " --out " & quoted form of thePath
          do shell script "rm " & quoted form of tiffPath
          return "success"
        on error errMsg
          return "error: " & errMsg
        end try
      end try
    `
    
    const result = spawnSync('osascript', ['-e', script], {
      encoding: 'utf-8',
      timeout: 10000,
    })
    
    if (result.status === 0 && existsSync(imagePath)) {
      return { success: true, imagePath, filename }
    }
    
    return {
      success: false,
      error: result.stderr || 'Failed to read image from clipboard',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if clipboard contains an image (Linux)
 */
function hasImageLinux(): boolean {
  try {
    // Check available clipboard targets
    const result = spawnSync('xclip', [
      '-selection', 'clipboard',
      '-t', 'TARGETS',
      '-o',
    ], { encoding: 'utf-8', timeout: 5000 })
    
    if (result.status !== 0) {
      // Try wl-paste for Wayland
      const wlResult = spawnSync('wl-paste', ['--list-types'], {
        encoding: 'utf-8',
        timeout: 5000,
      })
      if (wlResult.status === 0) {
        const output = wlResult.stdout || ''
        return output.includes('image/')
      }
      return false
    }
    
    const output = result.stdout || ''
    return output.includes('image/png') || 
           output.includes('image/jpeg') || 
           output.includes('image/tiff')
  } catch {
    return false
  }
}

/**
 * Read image from clipboard (Linux)
 */
function readImageLinux(): ClipboardImageResult {
  try {
    const tempDir = getClipboardTempDir()
    const filename = generateImageFilename()
    const imagePath = path.join(tempDir, filename)
    
    // Try xclip first
    let result = spawnSync('xclip', [
      '-selection', 'clipboard',
      '-t', 'image/png',
      '-o',
    ], { timeout: 5000, maxBuffer: 50 * 1024 * 1024 })
    
    if (result.status === 0 && result.stdout && result.stdout.length > 0) {
      writeFileSync(imagePath, result.stdout)
      return { success: true, imagePath, filename }
    }
    
    // Try wl-paste for Wayland
    result = spawnSync('wl-paste', ['--type', 'image/png'], {
      timeout: 5000,
      maxBuffer: 50 * 1024 * 1024,
    })
    
    if (result.status === 0 && result.stdout && result.stdout.length > 0) {
      writeFileSync(imagePath, result.stdout)
      return { success: true, imagePath, filename }
    }
    
    return {
      success: false,
      error: 'No image found in clipboard or failed to read',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if clipboard contains an image (Windows)
 */
function hasImageWindows(): boolean {
  try {
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      if ([System.Windows.Forms.Clipboard]::ContainsImage()) { Write-Output "true" } else { Write-Output "false" }
    `
    const result = spawnSync('powershell', ['-Command', script], {
      encoding: 'utf-8',
      timeout: 5000,
    })
    
    return result.stdout?.trim() === 'true'
  } catch {
    return false
  }
}

/**
 * Read image from clipboard (Windows)
 */
function readImageWindows(): ClipboardImageResult {
  try {
    const tempDir = getClipboardTempDir()
    const filename = generateImageFilename()
    const imagePath = path.join(tempDir, filename)
    
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      $img = [System.Windows.Forms.Clipboard]::GetImage()
      if ($img -ne $null) {
        $img.Save('${imagePath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output "success"
      } else {
        Write-Output "no image"
      }
    `
    
    const result = spawnSync('powershell', ['-Command', script], {
      encoding: 'utf-8',
      timeout: 10000,
    })
    
    if (result.stdout?.trim() === 'success' && existsSync(imagePath)) {
      return { success: true, imagePath, filename }
    }
    
    return {
      success: false,
      error: 'No image in clipboard or failed to save',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if clipboard contains an image (cross-platform)
 */
export function hasClipboardImage(): boolean {
  const platform = process.platform
  
  switch (platform) {
    case 'darwin':
      return hasImageMacOS()
    case 'linux':
      return hasImageLinux()
    case 'win32':
      return hasImageWindows()
    default:
      return false
  }
}

/**
 * Read image from clipboard and save to temp file
 * Returns the path to the saved image file
 */
export function readClipboardImage(): ClipboardImageResult {
  const platform = process.platform
  
  switch (platform) {
    case 'darwin':
      return readImageMacOS()
    case 'linux':
      return readImageLinux()
    case 'win32':
      return readImageWindows()
    default:
      return {
        success: false,
        error: `Unsupported platform: ${platform}`,
      }
  }
}

/**
 * Read text from clipboard. Returns null if reading fails.
 */
export function readClipboardText(): string | null {
  try {
    const platform = process.platform
    let result: ReturnType<typeof spawnSync>
    
    switch (platform) {
      case 'darwin':
        result = spawnSync('pbpaste', [], { encoding: 'utf-8', timeout: 1000 })
        break
      case 'win32':
        result = spawnSync('powershell', ['-Command', 'Get-Clipboard'], { encoding: 'utf-8', timeout: 1000 })
        break
      case 'linux':
        result = spawnSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf-8', timeout: 1000 })
        break
      default:
        return null
    }
    
    if (result.status === 0 && result.stdout) {
      const output = typeof result.stdout === 'string' ? result.stdout : result.stdout.toString('utf-8')
      return output.replace(/\n+$/, '')
    }
    return null
  } catch {
    return null
  }
}

