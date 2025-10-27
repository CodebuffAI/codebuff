import GraphemeSplitter from 'grapheme-splitter'
import stripAnsi from 'strip-ansi'

import {
  type Color,
  type BackgroundColor,
  type RGB,
  type Modifier,
  ansiCode,
  moveCursor,
  STYLE,
} from './ansi'

export const BLANK_GRAPHEME = ' ' as $GraphemeString
type $GraphemeString = string & { readonly _brand: 'GraphemeString' }

export type Grapheme = {
  grapheme: $GraphemeString
  textColor?: { type: 'color'; color: Color } | { type: 'rgb'; rgb: RGB }
  backgroundColor?:
    | { type: 'color'; color: BackgroundColor }
    | { type: 'rgb'; rgb: RGB }
  textStyles?: Modifier[]
}

export type GraphemeImage = Grapheme[][]

const splitter = new GraphemeSplitter()

export function toGraphemeString(grapheme: string): $GraphemeString {
  const stripped = stripAnsi(grapheme)
  const numGraphemes = splitter.countGraphemes(stripped)
  if (numGraphemes === 0) {
    return BLANK_GRAPHEME
  }

  const first = splitter.iterateGraphemes(stripped).next()
    .value as $GraphemeString
  return first as $GraphemeString
}

type GraphemeColor =
  | { type: 'color'; color: Color | BackgroundColor }
  | { type: 'rgb'; rgb: RGB }

function colorsEqual(
  a: GraphemeColor | undefined,
  b: GraphemeColor | undefined,
): boolean {
  if (!a && !b) {
    return true
  }

  if (!a || !b) {
    return false
  }

  if (a.type !== b.type) {
    return false
  }

  if (a.type === 'color' && b.type === 'color') {
    return a.color === b.color
  }

  if (a.type === 'rgb' && b.type === 'rgb') {
    return (
      a.rgb[0] === b.rgb[0] &&
      a.rgb[1] === b.rgb[1] &&
      a.rgb[2] === b.rgb[2]
    )
  }

  return false
}

function stylesEqual(a: Grapheme, b: Grapheme): boolean {
  if (!colorsEqual(a.textColor, b.textColor)) {
    return false
  }

  if (!colorsEqual(a.backgroundColor, b.backgroundColor)) {
    return false
  }

  const aStyles = a.textStyles ?? []
  const bStyles = b.textStyles ?? []
  if (aStyles.length !== bStyles.length) {
    return false
  }
  for (let i = 0; i < aStyles.length; i++) {
    if (aStyles[i] !== bStyles[i]) {
      return false
    }
  }

  return true
}

function graphemeCommands(grapheme: Grapheme): string {
  let command = ''
  if (grapheme.textColor) {
    command += ansiCode(
      grapheme.textColor.type === 'color'
        ? {
            type: 'style',
            style: grapheme.textColor.color,
          }
        : {
            type: 'text',
            rgb: grapheme.textColor.rgb,
          },
    )
  }
  if (grapheme.backgroundColor) {
    command += ansiCode(
      grapheme.backgroundColor.type === 'color'
        ? {
            type: 'style',
            style: grapheme.backgroundColor.color,
          }
        : {
            type: 'text',
            rgb: grapheme.backgroundColor.rgb,
          },
    )
  }

  if (grapheme.textStyles) {
    for (const style of grapheme.textStyles) {
      command += ansiCode({ type: 'style', style })
    }
  }

  command += grapheme.grapheme

  return command
}

function graphemeDiffCommands(
  prevGrapheme: Grapheme | null,
  newGrapheme: Grapheme,
): string {
  if (!prevGrapheme) {
    return graphemeCommands(newGrapheme)
  }

  if (stylesEqual(prevGrapheme, newGrapheme)) {
    return newGrapheme.grapheme
  }

  return (
    ansiCode({ type: 'style', style: STYLE.RESET }) +
    graphemeCommands(newGrapheme)
  )
}

export function fullImageCommands(image: GraphemeImage): string {
  let command = moveCursor(0, 0)

  let lastGrapheme: Grapheme | null = null
  for (const row of image) {
    for (const grapheme of row) {
      command += graphemeDiffCommands(lastGrapheme, grapheme)
      lastGrapheme = grapheme
    }
  }

  return command
}

export function diffImageCommands(
  oldImage: GraphemeImage,
  newImage: GraphemeImage,
): string {
  if (oldImage.length !== newImage.length) {
    return fullImageCommands(newImage)
  }
  if (oldImage[0].length !== newImage[0].length) {
    return fullImageCommands(newImage)
  }

  let command = ''
  let prevWrittenGrapheme: Grapheme | null = null
  let skipped = true
  for (const [r, newRow] of newImage.entries()) {
    const oldRow = oldImage[r]
    for (const [c, newGrapheme] of newRow.entries()) {
      const prevFrameGrapheme = oldRow[c]
      if (
        newGrapheme.grapheme === prevFrameGrapheme.grapheme &&
        stylesEqual(newGrapheme, prevFrameGrapheme)
      ) {
        skipped = true
        continue
      }

      if (skipped) {
        command += moveCursor(r, c)
        skipped = false
      }

      command += graphemeDiffCommands(prevWrittenGrapheme, newGrapheme)
      prevWrittenGrapheme = newGrapheme
    }
  }
  return command
}
