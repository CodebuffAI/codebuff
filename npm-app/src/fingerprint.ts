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

export const FINGERPRINTING_INFO = (async function () {
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
})()

export async function calculateFingerprint() {
  console.time('calculateFingerprint')
  const fingerprintString = JSON.stringify(await FINGERPRINTING_INFO)
  const fingerprintHash = createHash('sha256').update(fingerprintString)
  const result = fingerprintHash.digest().toString('base64url')
  console.timeEnd('calculateFingerprint')
  return result
}
