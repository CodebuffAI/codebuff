import { createHash } from 'node:crypto'
import {
  system,
  bios,
  baseboard,
  cpu,
  osInfo,
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
    speedMax: speedMax?.toFixed(2),
    cores,
    physicalCores,
    socket,
    platform,
    arch,
  } as Record<string, any>
}

export async function calculateFingerprint(): Promise<string> {
  const fingerprintInfo = await getFingerprintInfo()
  const fingerprintString = JSON.stringify(fingerprintInfo)
  return createHash('sha256').update(fingerprintString).digest('base64url')
}
