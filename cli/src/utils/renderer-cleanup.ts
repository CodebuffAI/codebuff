import type { CliRenderer } from '@opentui/core'

/**
 * Global reference to the CLI renderer for cleanup on exit.
 * This allows the exit handler to properly destroy the renderer,
 * which resets terminal state (mouse tracking, focus reporting, raw mode, etc.)
 */
let registeredRenderer: CliRenderer | null = null

/**
 * Register the renderer for cleanup on exit.
 * Call this after creating the renderer in index.tsx.
 */
export function registerRendererForCleanup(renderer: CliRenderer): void {
  registeredRenderer = renderer
}

/**
 * Cleanup the renderer by calling destroy().
 * This resets terminal state to prevent garbled output after exit.
 * Should be called before process.exit() in exit handlers.
 */
export function cleanupRenderer(): void {
  if (registeredRenderer && !registeredRenderer.isDestroyed) {
    try {
      registeredRenderer.destroy()
    } catch {
      // Ignore errors during cleanup - we're exiting anyway
    }
    registeredRenderer = null
  }
}
