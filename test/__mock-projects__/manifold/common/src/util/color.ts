export const interpolateColor = (color1: string, color2: string, p: number) => {
  const rgb1 = parseInt(color1.replace('#', ''), 16)
  const rgb2 = parseInt(color2.replace('#', ''), 16)

  const [r1, g1, b1] = toArray(rgb1)
  const [r2, g2, b2] = toArray(rgb2)

  const q = 1 - p
  const rr = Math.round(r1 * q + r2 * p)
  const rg = Math.round(g1 * q + g2 * p)
  const rb = Math.round(b1 * q + b2 * p)

  const hexString = Number((rr << 16) + (rg << 8) + rb).toString(16)
  const hex = `#${'0'.repeat(6 - hexString.length)}${hexString}`
  return hex
}

function toArray(rgb: number) {
  const r = rgb >> 16
  const g = (rgb >> 8) % 256
  const b = rgb % 256

  return [r, g, b]
}
