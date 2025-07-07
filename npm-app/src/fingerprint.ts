// Enhanced fingerprinting with FingerprintJS and backward compatibility
// Modified from: https://github.com/andsmedeiros/hw-fingerprint

import { createHash, randomBytes } from 'node:crypto'
import {
  bios,
  cpu,
  graphics,
  mem,
  osInfo,
  system,
  // @ts-ignore
} from 'systeminformation'

import { findChrome } from './browser-runner'
import { logger } from './utils/logger'

// Type declaration for FingerprintJS result
declare global {
  interface Window {
    fingerprintResult?: {
      visitorId: string
      confidence: { score: number }
      components: Record<string, any>
    }
  }
}

// Legacy fingerprint implementation (for backward compatibility)
const getFingerprintInfo = async () => {
  const { manufacturer, model, serial, uuid } = await system()
  const { vendor, version: biosVersion, releaseDate } = await bios()
  const { manufacturer: cpuManufacturer, brand, speed, cores } = await cpu()
  const { total: totalMemory } = await mem()
  const { controllers } = await graphics()
  const { platform, arch } = await osInfo()

  return {
    system: {
      manufacturer,
      model,
      serial,
      uuid,
    },
    bios: {
      vendor,
      version: biosVersion,
      releaseDate,
    },
    cpu: {
      manufacturer: cpuManufacturer,
      brand,
      speed,
      cores,
    },
    memory: {
      total: totalMemory,
    },
    graphics: {
      controllers: controllers?.map((c) => ({
        vendor: c.vendor,
        model: c.model,
        vram: c.vram,
      })),
    },
    os: {
      platform,
      arch,
    },
  } as Record<string, any>
}

// Legacy implementation with random suffix (still needed for collision avoidance)
async function calculateLegacyFingerprint() {
  const fingerprintInfo = await getFingerprintInfo()
  const fingerprintString = JSON.stringify(fingerprintInfo)
  const fingerprintHash = createHash('sha256')
    .update(fingerprintString)
    .digest()
    .toString('base64url')

  // Add 8 random characters to make the fingerprint unique even on identical hardware
  const randomSuffix = randomBytes(6).toString('base64url').substring(0, 8)

  return `legacy-${fingerprintHash}-${randomSuffix}`
}

// Enhanced FingerprintJS implementation using headless browser
async function calculateEnhancedFingerprint(): Promise<string> {
  try {
    const puppeteer = await import('puppeteer-core')
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: findChrome(),
    })
    
    const page = await browser.newPage()
    
    // Create a minimal HTML page with FingerprintJS
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@4/dist/fp.min.js"></script>
      </head>
      <body>
        <script>
          (async () => {
            // Initialize FingerprintJS
            const fp = await FingerprintJS.load()
            
            // Get the visitor identifier
            const result = await fp.get()
            
            // Make the result available to Node.js
            window.fingerprintResult = {
              visitorId: result.visitorId,
              confidence: result.confidence,
              components: result.components
            }
          })()
        </script>
      </body>
      </html>
    `
    
    await page.setContent(html)
    
    // Wait for FingerprintJS to complete
    await page.waitForFunction(() => window.fingerprintResult, { timeout: 10000 })
    
    // Extract the fingerprint result
    const result = await page.evaluate(() => window.fingerprintResult)
    
    await browser.close()
    
    // Combine FingerprintJS result with system info for enhanced uniqueness
    const systemInfo = await getFingerprintInfo()
    const combinedData = {
      fingerprintjs: result!.visitorId,
      confidence: result!.confidence,
      system: systemInfo,
    }
    
    const combinedString = JSON.stringify(combinedData)
    const combinedHash = createHash('sha256')
      .update(combinedString)
      .digest()
      .toString('base64url')
    
    // No random suffix needed - FingerprintJS provides sufficient uniqueness
    return `fp-${combinedHash}`
  } catch (error) {
    logger.warn(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        fingerprintType: 'enhanced_failed',
      },
      'Enhanced fingerprinting failed, falling back to legacy'
    )
    throw error
  }
}

// Main fingerprint function with hybrid approach
export async function calculateFingerprint(): Promise<string> {
  try {
    // Try enhanced fingerprinting first
    const fingerprint = await calculateEnhancedFingerprint()
    logger.info(
      {
        fingerprintType: 'enhanced',
        fingerprintId: fingerprint,
      },
      'Enhanced fingerprint generated successfully'
    )
    return fingerprint
  } catch (enhancedError) {
    logger.info(
      {
        errorMessage: enhancedError instanceof Error ? enhancedError.message : String(enhancedError),
        fingerprintType: 'enhanced_failed_fallback',
      },
      'Enhanced fingerprinting failed, using legacy fallback'
    )
    
    try {
      const fingerprint = await calculateLegacyFingerprint()
      logger.info(
        {
          fingerprintType: 'legacy_fallback',
          fingerprintId: fingerprint,
        },
        'Legacy fingerprint generated successfully as fallback'
      )
      return fingerprint
    } catch (legacyError) {
      logger.error(
        {
          errorMessage: legacyError instanceof Error ? legacyError.message : String(legacyError),
          fingerprintType: 'failed',
        },
        'Both enhanced and legacy fingerprint generation failed'
      )
      throw new Error('Fingerprint generation failed')
    }
  }
}
