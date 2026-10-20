export type BoatBrowserSize = { width: number; height: number }

// Chrome's window minimum is 500px. CVT modes need widths divisible by 8;
// bounded CSS-pixel sizes keep the software encoder's work independent of DPR.
export function boatBrowserSize(
  width: number,
  height: number,
): BoatBrowserSize | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return null
  const scale = Math.min(
    Math.max(1, 512 / width, 128 / height),
    2560 / width,
    2160 / height,
  )
  return {
    width: Math.max(512, Math.min(2560, Math.round((width * scale) / 8) * 8)),
    height: Math.max(128, Math.min(2160, Math.round((height * scale) / 8) * 8)),
  }
}

export function isBoatBrowserSize(value: unknown): value is BoatBrowserSize {
  if (!value || typeof value !== 'object') return false
  const v = value as BoatBrowserSize
  return (
    Object.keys(v).length === 2 &&
    Number.isInteger(v.width) &&
    v.width >= 512 &&
    v.width <= 2560 &&
    v.width % 8 === 0 &&
    Number.isInteger(v.height) &&
    v.height >= 128 &&
    v.height <= 2160 &&
    v.height % 8 === 0
  )
}

export function sameBoatBrowserSize(
  a: BoatBrowserSize | null,
  b: BoatBrowserSize | null,
) {
  return a?.width === b?.width && a?.height === b?.height
}
