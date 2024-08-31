import { Contract } from 'common/contract'
import { StateElectionMarket } from 'web/public/data/elections-data'

export const DEM_LIGHT_HEX = '#cedcef'
export const REP_LIGHT_HEX = '#f4dad7'
export const DEM_DARK_HEX = '#4a5fa8'
export const REP_DARK_HEX = '#9d3336'

export const COLOR_MIXED_THRESHOLD = 0.1

export function hexToRgb(hex: string) {
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

export const probToColor = (
  contract: Contract | null,
  data?: StateElectionMarket
) => {
  type Color = { r: number; g: number; b: number }
  function interpolateColor(color1: Color, color2: Color, factor: number) {
    // Linear interpolation between two colors
    const r = Math.round(color1.r + factor * (color2.r - color1.r))
    const g = Math.round(color1.g + factor * (color2.g - color1.g))
    const b = Math.round(color1.b + factor * (color2.b - color1.b))

    // Convert RGB to Hex
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }

  if (!contract || contract.mechanism !== 'cpmm-multi-1') return undefined
  const answers = contract.answers

  // Base colors
  const DEM_LIGHT = hexToRgb(DEM_LIGHT_HEX)
  const REP_LIGHT = hexToRgb(REP_LIGHT_HEX)
  const DEM_DARK = hexToRgb(DEM_DARK_HEX)
  const REP_DARK = hexToRgb(REP_DARK_HEX)

  let probDemocratic = answers.find(
    (a) => a.text == 'Democratic Party' || a.text.includes('Democratic Party')
  )?.prob
  let probRepublican = answers.find(
    (a) => a.text == 'Republican Party' || a.text.includes('Republican Party')
  )?.prob
  const probOther = answers.find((a) => a.text == 'Other')?.prob

  if (
    probDemocratic === undefined ||
    probRepublican === undefined ||
    probOther === undefined
  )
    return undefined

  if (data?.otherParty) {
    console.log(data, probDemocratic, probRepublican, probOther)
  }
  if (data && data.otherParty) {
    if (data.otherParty == 'Democratic Party') {
      probDemocratic += probOther
    }
    if (data.otherParty == 'Republican Party') {
      probRepublican += probOther
    }
  }
  if (data?.otherParty) {
    console.log('AFTER', data, probDemocratic, probRepublican, probOther)
  }
  // Calculate the difference
  const repOverDem = probRepublican - probDemocratic
  const absoluteDifference = Math.abs(repOverDem)

  if (absoluteDifference < COLOR_MIXED_THRESHOLD / 2) {
    // Blend the light colors if difference is less than 5%
    return interpolateColor(
      DEM_LIGHT,
      REP_LIGHT,
      (repOverDem + COLOR_MIXED_THRESHOLD / 2) / COLOR_MIXED_THRESHOLD
    )
  } else {
    // Interpolate towards the darker shade based on the dominant side
    if (repOverDem < 0) {
      return interpolateColor(
        DEM_LIGHT,
        DEM_DARK,
        (absoluteDifference - COLOR_MIXED_THRESHOLD) /
          (1 - COLOR_MIXED_THRESHOLD)
      )
    } else {
      return interpolateColor(
        REP_LIGHT,
        REP_DARK,
        (absoluteDifference - COLOR_MIXED_THRESHOLD) /
          (1 - COLOR_MIXED_THRESHOLD)
      )
    }
  }
}

// Calculates the luminance of an RGB color
function calculateLuminance(rgb: { r: number; g: number; b: number }): number {
  const { r, g, b } = rgb
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Determines if the color is light
export function isColorLight(colorHex: string): boolean {
  const rgb = hexToRgb(colorHex)
  if (!rgb) return false // or handle error

  const luminance = calculateLuminance(rgb)
  return luminance > 0.75 // Adjust threshold as needed
}
