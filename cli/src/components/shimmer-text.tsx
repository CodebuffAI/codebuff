import { TextAttributes } from '@opentui/core'
import React, { useEffect, useMemo, useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import {
  SHIMMER_ATTR_BOLD_THRESHOLD,
  SHIMMER_ATTR_DIM_THRESHOLD,
  SHIMMER_INTERVAL_MS,
  SHIMMER_LIGHTNESS_MAX,
  SHIMMER_LIGHTNESS_MIN,
  SHIMMER_LIGHTNESS_RANGE,
  SHIMMER_PALETTE_DYNAMIC_MAX,
  SHIMMER_PALETTE_DYNAMIC_MIN,
  SHIMMER_PALETTE_DYNAMIC_MULTIPLIER,
  SHIMMER_PALETTE_MAX_SIZE,
  SHIMMER_PALETTE_MIN_SIZE,
  SHIMMER_SATURATION_MAX,
  SHIMMER_SATURATION_MIN,
  SHIMMER_SATURATION_SCALE_AMPLITUDE,
  SHIMMER_SATURATION_SCALE_BASE,
} from '../utils/ui-constants'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const normalizeHex = (hex: string): string | null => {
  const trimmed = hex.trim()
  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  if (withoutHash.length === 3) {
    return withoutHash
      .split('')
      .map((char) => char + char)
      .join('')
  }
  if (withoutHash.length === 6) {
    return withoutHash
  }
  return null
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return { r, g, b }
}

const rgbToHsl = (
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }

  return { h, s, l }
}

const hueToRgb = (p: number, q: number, t: number): number => {
  let temp = t
  if (temp < 0) temp += 1
  if (temp > 1) temp -= 1
  if (temp < 1 / 6) return p + (q - p) * 6 * temp
  if (temp < 1 / 2) return q
  if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6
  return p
}

const hslToRgb = (
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } => {
  if (s === 0) {
    return { r: l, g: l, b: l }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  }
}

const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (value: number) =>
    Math.round(clamp(value, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const generatePaletteFromPrimary = (
  primaryColor: string,
  size: number,
  fallbackColor: string,
): string[] => {
  const baseRgb = hexToRgb(primaryColor)
  if (!baseRgb) {
    // If we can't parse the color, return a simple palette using the fallback
    return Array.from({ length: size }, () => fallbackColor)
  }

  const { h, s, l } = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b)
  const palette: string[] = []
  const paletteSize = Math.max(
    SHIMMER_PALETTE_MIN_SIZE,
    Math.min(SHIMMER_PALETTE_MAX_SIZE, size)
  )

  for (let i = 0; i < paletteSize; i++) {
    const ratio = paletteSize === 1 ? 0.5 : i / (paletteSize - 1)
    const offset = (0.5 - ratio) * 2 * SHIMMER_LIGHTNESS_RANGE
    const adjustedLightness = clamp(
      l + offset,
      SHIMMER_LIGHTNESS_MIN,
      SHIMMER_LIGHTNESS_MAX
    )
    const saturationScale =
      SHIMMER_SATURATION_SCALE_BASE +
      SHIMMER_SATURATION_SCALE_AMPLITUDE * Math.cos(ratio * Math.PI)
    const adjustedSaturation = clamp(
      s * saturationScale,
      SHIMMER_SATURATION_MIN,
      SHIMMER_SATURATION_MAX
    )
    const { r, g, b } = hslToRgb(h, adjustedSaturation, adjustedLightness)
    palette.push(rgbToHex(r, g, b))
  }

  return palette
}

export const ShimmerText = ({
  text,
  interval = SHIMMER_INTERVAL_MS,
  colors,
  primaryColor,
}: {
  text: string
  interval?: number
  colors?: string[]
  primaryColor?: string
}) => {
  const theme = useTheme()
  const [pulse, setPulse] = useState<number>(0)
  const chars = text.split('')
  const numChars = chars.length

  if (numChars === 0) {
    return <></>
  }

  useEffect(() => {
    if (numChars === 0) {
      return
    }
    const pulseInterval = setInterval(() => {
      setPulse((prev) => (prev + 1) % numChars)
    }, interval)

    return () => clearInterval(pulseInterval)
  }, [interval, numChars])

  /**
   * Generates an array of colors with guaranteed length.
   * @param length - The exact number of colors to generate
   * @param palette - The color palette to interpolate from
   * @returns An array of exactly `length` colors
   */
  const generateColors = (length: number, palette: string[]): string[] => {
    if (length === 0) return []
    if (palette.length === 0) {
      return Array.from({ length }, () => theme.muted)
    }
    if (palette.length === 1) {
      return Array.from({ length }, () => palette[0]!)
    }
    const generated: string[] = new Array(length)
    for (let i = 0; i < length; i++) {
      const ratio = length === 1 ? 0 : i / (length - 1)
      const colorIndex = Math.min(
        palette.length - 1,
        Math.floor(ratio * (palette.length - 1)),
      )
      generated[i] = palette[colorIndex]!
    }
    return generated
  }

  const palette = useMemo(() => {
    if (colors && colors.length > 0) {
      return colors
    }
    const paletteSize = Math.max(
      SHIMMER_PALETTE_DYNAMIC_MIN,
      Math.min(
        SHIMMER_PALETTE_DYNAMIC_MAX,
        Math.ceil(numChars * SHIMMER_PALETTE_DYNAMIC_MULTIPLIER)
      )
    )
    const seedColor = primaryColor ?? theme.info
    return generatePaletteFromPrimary(seedColor, paletteSize, theme.muted)
  }, [colors, primaryColor, numChars, theme.info, theme.muted])

  /**
   * Generates an array of text attributes with guaranteed length.
   * @param length - The exact number of attributes to generate
   * @returns An array of exactly `length` attributes
   */
  const generateAttributes = (length: number): number[] => {
    const attributes: number[] = new Array(length)
    for (let i = 0; i < length; i++) {
      const ratio = length <= 1 ? 0 : i / (length - 1)
      if (ratio < SHIMMER_ATTR_BOLD_THRESHOLD) {
        attributes[i] = TextAttributes.BOLD
      } else if (ratio < SHIMMER_ATTR_DIM_THRESHOLD) {
        attributes[i] = TextAttributes.NONE
      } else {
        attributes[i] = TextAttributes.DIM
      }
    }
    return attributes
  }

  const generatedColors = useMemo(
    () => generateColors(numChars, palette),
    [numChars, palette],
  )
  const attributes = useMemo(() => generateAttributes(numChars), [numChars])

  const parts: { text: string; color: string; attr: number }[] = []
  let currentColor: string | undefined
  let currentAttr: number | undefined
  let buffer = ''

  chars.forEach((char, index) => {
    const phase = (pulse - index + numChars) % numChars
    // Since arrays are guaranteed to have correct length, we can assert non-null
    const charColor = generatedColors[phase]!
    const charAttr = attributes[phase]!

    if (currentColor === undefined) {
      currentColor = charColor
      currentAttr = charAttr
    }

    if (charColor === currentColor && charAttr === currentAttr) {
      buffer += char
    } else {
      if (buffer) {
        parts.push({
          text: buffer,
          color: currentColor,
          attr: currentAttr,
        })
      }
      buffer = char
      currentColor = charColor
      currentAttr = charAttr
    }
  })

  if (buffer && currentColor !== undefined && currentAttr !== undefined) {
    parts.push({
      text: buffer,
      color: currentColor,
      attr: currentAttr,
    })
  }

  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part.color}-${index}`} fg={part.color} attributes={part.attr}>
          {part.text}
        </span>
      ))}
    </>
  )
}
