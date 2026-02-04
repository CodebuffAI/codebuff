/**
 * GIF Exporter - Renders tmux session captures as an animated GIF
 *
 * Uses node-canvas to render terminal content as frames and gif-encoder-2 to encode.
 */

import path from 'path'

import { createCanvas } from 'canvas'
import GIFEncoder from 'gif-encoder-2'

import type { SessionData, Capture } from './types'
import type { CanvasRenderingContext2D } from 'canvas'

// Types are in gif-encoder-2.d.ts

export interface GifExportOptions {
  /** Output file path for the GIF */
  outputPath: string
  /** Delay between frames in milliseconds (default: 1500) */
  frameDelay?: number
  /** Font size in pixels (default: 14) */
  fontSize?: number
  /** Background color (default: '#1e1e1e') */
  bgColor?: string
  /** Foreground/text color (default: '#d4d4d4') */
  fgColor?: string
  /** Canvas width in pixels (default: auto-calculated from terminal width) */
  width?: number
  /** Canvas height in pixels (default: auto-calculated from terminal height) */
  height?: number
  /** Number of times to loop (0 = infinite, default: 0) */
  loop?: number
  /** Quality setting 1-20, lower = better quality (default: 10) */
  quality?: number
  /** Show frame label/timestamp overlay (default: true) */
  showLabel?: boolean
}

interface RenderContext {
  fontSize: number
  lineHeight: number
  charWidth: number
  bgColor: string
  fgColor: string
  labelColor: string
  showLabel: boolean
}

/**
 * Calculate canvas dimensions based on terminal size and font metrics
 */
function calculateDimensions(
  sessionData: SessionData,
  options: GifExportOptions
): { width: number; height: number; charWidth: number; lineHeight: number } {
  const fontSize = options.fontSize ?? 14
  // Approximate character dimensions for monospace font
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * 1.2

  // Get terminal dimensions from session info or first capture
  let termWidth = 80
  let termHeight = 24

  if (sessionData.sessionInfo.dimensions) {
    termWidth =
      typeof sessionData.sessionInfo.dimensions.width === 'number'
        ? sessionData.sessionInfo.dimensions.width
        : 80
    termHeight =
      typeof sessionData.sessionInfo.dimensions.height === 'number'
        ? sessionData.sessionInfo.dimensions.height
        : 24
  }

  // Calculate canvas size with padding
  const padding = 20
  const labelHeight = options.showLabel !== false ? 30 : 0

  const width = options.width ?? Math.ceil(termWidth * charWidth + padding * 2)
  const height =
    options.height ?? Math.ceil(termHeight * lineHeight + padding * 2 + labelHeight)

  return { width, height, charWidth, lineHeight }
}

/**
 * Render a single capture frame to the canvas
 */
function renderFrame(
  ctx: CanvasRenderingContext2D,
  capture: Capture,
  canvasWidth: number,
  canvasHeight: number,
  renderCtx: RenderContext
): void {
  const { fontSize, lineHeight, bgColor, fgColor, labelColor, showLabel } = renderCtx

  // Clear and fill background
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // Set up text rendering
  ctx.font = `${fontSize}px monospace`
  ctx.textBaseline = 'top'
  ctx.fillStyle = fgColor

  // Calculate content area
  const padding = 10
  const labelHeight = showLabel ? 30 : 0
  const contentStartY = padding + labelHeight

  // Render label if enabled
  if (showLabel) {
    const label = capture.frontMatter.label || `Capture ${capture.frontMatter.sequence}`
    const time = formatTimestamp(capture.frontMatter.timestamp)

    ctx.fillStyle = labelColor
    ctx.font = `bold ${fontSize - 2}px sans-serif`
    ctx.fillText(`[${capture.frontMatter.sequence}] ${label}`, padding, padding)

    // Time on the right
    const timeText = time
    const timeWidth = ctx.measureText(timeText).width
    ctx.fillText(timeText, canvasWidth - padding - timeWidth, padding)

    // Draw separator line
    ctx.strokeStyle = labelColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padding, padding + fontSize + 5)
    ctx.lineTo(canvasWidth - padding, padding + fontSize + 5)
    ctx.stroke()
  }

  // Render terminal content
  ctx.font = `${fontSize}px monospace`
  ctx.fillStyle = fgColor

  const lines = capture.content.split('\n')
  const maxLines = Math.floor((canvasHeight - contentStartY - padding) / lineHeight)

  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const line = lines[i]
    // Strip ANSI codes for now (basic support)
    const cleanLine = stripAnsiCodes(line)
    ctx.fillText(cleanLine, padding, contentStartY + i * lineHeight)
  }

  // Show truncation indicator if content was cut off
  if (lines.length > maxLines) {
    ctx.fillStyle = labelColor
    ctx.font = `italic ${fontSize - 2}px sans-serif`
    ctx.fillText(
      `... ${lines.length - maxLines} more lines`,
      padding,
      canvasHeight - padding - fontSize
    )
  }
}

/**
 * Strip ANSI escape codes from text
 */
function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

/**
 * Format ISO timestamp into readable time
 */
function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return isoTimestamp.slice(11, 19)
  }
}

/**
 * Export session replay as an animated GIF
 *
 * @param sessionData - The loaded session data
 * @param options - Export options
 * @returns Promise that resolves to the output path when complete
 */
export async function renderSessionToGif(
  sessionData: SessionData,
  options: GifExportOptions
): Promise<string> {
  const captures = sessionData.captures

  if (captures.length === 0) {
    throw new Error('No captures to export - session has no captured frames')
  }

  // Apply defaults
  const frameDelay = options.frameDelay ?? 1500
  const fontSize = options.fontSize ?? 14
  const bgColor = options.bgColor ?? '#1e1e1e'
  const fgColor = options.fgColor ?? '#d4d4d4'
  const loop = options.loop ?? 0
  const quality = options.quality ?? 10
  const showLabel = options.showLabel !== false

  // Calculate dimensions
  const { width, height, charWidth, lineHeight } = calculateDimensions(sessionData, {
    ...options,
    fontSize,
    showLabel,
  })

  // Create canvas
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // Create GIF encoder
  const encoder = new GIFEncoder(width, height)

  encoder.start()
  encoder.setDelay(frameDelay)
  encoder.setRepeat(loop)
  encoder.setQuality(quality)

  // Render context for frames
  const renderCtx: RenderContext = {
    fontSize,
    lineHeight,
    charWidth,
    bgColor,
    fgColor,
    labelColor: '#888888',
    showLabel,
  }

  // Render each capture as a frame
  for (const capture of captures) {
    renderFrame(ctx, capture, width, height, renderCtx)
    encoder.addFrame(ctx)
  }

  encoder.finish()

  // Write to file
  const outputPath = path.resolve(options.outputPath)
  const buffer = encoder.out.getData()

  await Bun.write(outputPath, buffer)

  return outputPath
}

/**
 * Get suggested output filename based on session name.
 * Returns a path inside the session folder (debug/tmux-sessions/{session}/).
 */
export function getSuggestedFilename(sessionData: SessionData): string {
  const sessionName = sessionData.sessionInfo.session
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `debug/tmux-sessions/${sessionName}/${sessionName}-${timestamp}.gif`
}
