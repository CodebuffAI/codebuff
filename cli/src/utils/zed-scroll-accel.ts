import type { ScrollAcceleration } from '@opentui/core'

export class ZedScrollAccel implements ScrollAcceleration {
  private eventTimestamps: number[] = []
  private readonly timeWindow = 500
  private readonly baseMultiplier = 0.35

  tick(now = Date.now()): number {
    this.eventTimestamps.push(now)

    const cutoffTime = now - this.timeWindow
    this.eventTimestamps = this.eventTimestamps.filter((t) => t > cutoffTime)

    const eventCount = this.eventTimestamps.length

    if (eventCount < 5) {
      return this.baseMultiplier
    } else if (eventCount < 10) {
      const boost = ((eventCount - 5) / 5) * 0.135
      return this.baseMultiplier * (1 + boost)
    } else if (eventCount < 15) {
      const boost = 0.135 + ((eventCount - 10) / 5) * 0.219
      return this.baseMultiplier * (1 + boost)
    } else {
      const boost = 0.354 + ((eventCount - 15) / 10) * 0.381
      return this.baseMultiplier * (1 + Math.min(boost, 0.735))
    }
  }

  reset(): void {
    this.eventTimestamps = []
  }
}
