// Enhanced fingerprinting with CLI-only approach and backward compatibility
// Modified from: https://github.com/andsmedeiros/hw-fingerprint

import { createHash, randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import {
  bios,
  cpu,
  graphics,
  mem,
  osInfo,
  system,
  // @ts-ignore
} from 'systeminformation'
import { machineId } from 'node-machine-id'

import { detectShell } from './utils/detect-shell'
import { getSystemInfo } from './utils/system-info'
import { logger } from './utils/logger'

// Enhanced CLI fingerprint implementation using multiple Node.js data sources
const getEnhancedFingerprintInfo = async () => {
  // Get essential system information efficiently
  const [
    systemInfo,
    cpuInfo,
    osInfo_,
    machineIdValue,
    systemInfoBasic,
    shell,
    networkInfo
  ] = await Promise.all([
    system(),
    cpu(),
    osInfo(),
    machineId().catch(() => 'unknown'),
    getSystemInfo(),
    detectShell(),
    Promise.resolve(networkInterfaces())
  ])

  // Extract MAC addresses for additional uniqueness
  const macAddresses = Object.values(networkInfo)
    .flat()
    .filter(iface => iface && !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00')
    .map(iface => iface!.mac)
    .sort()

  return {
    // Hardware identifiers
    system: {
      manufacturer: systemInfo.manufacturer,
      model: systemInfo.model,
      serial: systemInfo.serial,
      uuid: systemInfo.uuid,
    },
    cpu: {
      manufacturer: cpuInfo.manufacturer,
      brand: cpuInfo.brand,
      cores: cpuInfo.cores,
      physicalCores: cpuInfo.physicalCores,
    },
    os: {
      platform: osInfo_.platform,
      distro: osInfo_.distro,
      arch: osInfo_.arch,
      hostname: osInfo_.hostname,
    },
    // CLI-specific identifiers
    runtime: {
      nodeVersion: systemInfoBasic.nodeVersion,
      platform: systemInfoBasic.platform,
      arch: systemInfoBasic.arch,
      shell,
      cpuCount: systemInfoBasic.cpus,
    },
    // Network identifiers
    network: {
      macAddresses,
      interfaceCount: Object.keys(networkInfo).length,
    },
    // Machine ID (OS-specific unique identifier)
    machineId: machineIdValue,
    // Timestamp for version tracking
    fingerprintVersion: '2.0',
  } as Record<string, any>
}

// Legacy fingerprint implementation (for backward compatibility)
const getLegacyFingerprintInfo = async () => {
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

// Enhanced CLI-only fingerprint (deterministic, no browser required)
async function calculateEnhancedFingerprint(): Promise<string> {
  try {
    const fingerprintInfo = await getEnhancedFingerprintInfo()
    const fingerprintString = JSON.stringify(fingerprintInfo)
    const fingerprintHash = createHash('sha256')
      .update(fingerprintString)
      .digest()
      .toString('base64url')

    // No random suffix needed - comprehensive system data provides sufficient uniqueness
    return `enhanced-${fingerprintHash}`
  } catch (error) {
    logger.warn(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        fingerprintType: 'enhanced_failed',
      },
      'Enhanced CLI fingerprinting failed, falling back to legacy'
    )
    throw error
  }
}

// Legacy implementation with random suffix (still needed for collision avoidance)
async function calculateLegacyFingerprint() {
  const fingerprintInfo = await getLegacyFingerprintInfo()
  const fingerprintString = JSON.stringify(fingerprintInfo)
  const fingerprintHash = createHash('sha256')
    .update(fingerprintString)
    .digest()
    .toString('base64url')

  // Add 8 random characters to make the fingerprint unique even on identical hardware
  const randomSuffix = randomBytes(6).toString('base64url').substring(0, 8)

  return `legacy-${fingerprintHash}-${randomSuffix}`
}

// Main fingerprint function with CLI-only approach
export async function calculateFingerprint(): Promise<string> {
  try {
    // Try enhanced CLI fingerprinting first
    const fingerprint = await calculateEnhancedFingerprint()
    logger.info(
      {
        fingerprintType: 'enhanced_cli',
        fingerprintId: fingerprint,
      },
      'Enhanced CLI fingerprint generated successfully'
    )
    return fingerprint
  } catch (enhancedError) {
    logger.info(
      {
        errorMessage: enhancedError instanceof Error ? enhancedError.message : String(enhancedError),
        fingerprintType: 'enhanced_failed_fallback',
      },
      'Enhanced CLI fingerprinting failed, using legacy fallback'
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
