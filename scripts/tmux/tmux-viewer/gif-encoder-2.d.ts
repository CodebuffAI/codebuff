/**
 * Type declarations for gif-encoder-2
 * @see https://github.com/benjaminadk/gif-encoder-2
 */

declare module 'gif-encoder-2' {
  import type { CanvasRenderingContext2D } from 'canvas'

  export default class GIFEncoder {
    constructor(
      width: number,
      height: number,
      algorithm?: 'neuquant' | 'octree',
      useOptimizer?: boolean
    )
    start(): void
    setDelay(delay: number): void
    setRepeat(repeat: number): void
    setQuality(quality: number): void
    setTransparent(color: number): void
    addFrame(ctx: CanvasRenderingContext2D): void
    finish(): void
    out: {
      getData(): Buffer
    }
    createReadStream(): NodeJS.ReadableStream
  }
}
