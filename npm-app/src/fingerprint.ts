// Modified from: https://github.com/andsmedeiros/hw-fingerprint

import { createHash } from 'node:crypto'
import { EOL, endianness } from 'node:os'
import {
  system,
  bios,
  baseboard,
  cpu,
  osInfo,
  // @ts-ignore
} from 'systeminformation'

const getFingerprintInfo = async () => {
  const { manufacturer, model, serial, uuid } = await system()
  const { vendor, version: biosVersion, releaseDate } = await bios()
  const {
    manufacturer: boardManufacturer,
    model: boardModel,
    serial: boardSerial,
  } = await baseboard()
  const {
    manufacturer: cpuManufacturer,
    brand,
    speedMax,
    cores,
    physicalCores,
    socket,
  } = await cpu()
  const { platform, arch } = await osInfo()

  return {
    EOL,
    endianness: endianness(),
    manufacturer,
    model,
    serial,
    uuid,
    vendor,
    biosVersion,
    releaseDate,
    boardManufacturer,
    boardModel,
    boardSerial,
    cpuManufacturer,
    brand,
    speedMax: speedMax.toFixed(2),
    cores,
    physicalCores,
    socket,
    platform,
    arch,
  } as Record<string, any>
}

export async function calculateFingerprint() {
  const fingerprintInfo = await getFingerprintInfo()
  const fingerprintString = JSON.stringify(fingerprintInfo)
  const fingerprintHash = createHash('sha256').update(fingerprintString)
  return fingerprintHash.digest().toString('base64url')
}
