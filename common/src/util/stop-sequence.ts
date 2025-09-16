import { suffixPrefixOverlap } from './string'

export class StopSequenceHandler {
  private buffer: string = ''
  private finished: boolean = false
  private stopSequences: string[]

  constructor(stopSequences?: string[]) {
    this.stopSequences = stopSequences ?? []
  }

  public process(
    text: string,
  ):
    | { text: string; endOfStream: boolean }
    | { text: null; endOfStream: true } {
    if (this.finished) {
      return {
        text: null,
        endOfStream: true,
      }
    }
    this.buffer += text
    let longestOverlap = ''

    for (const stopSequence of this.stopSequences) {
      const index = this.buffer.indexOf(stopSequence)
      if (index !== -1) {
        this.finished = true
        return {
          text: this.buffer.slice(0, index),
          endOfStream: true,
        }
      }
    }

    for (const stopSequence of this.stopSequences) {
      const overlap = suffixPrefixOverlap(this.buffer, stopSequence)
      longestOverlap =
        overlap.length > longestOverlap.length ? overlap : longestOverlap
    }

    const index = this.buffer.length - longestOverlap.length
    const processed = this.buffer.slice(0, index)
    this.buffer = this.buffer.slice(index)

    return {
      text: processed,
      endOfStream: false,
    }
  }

  public flush(): string {
    if (this.finished) {
      return ''
    }
    const b = this.buffer
    this.buffer = ''
    return b
  }
}
