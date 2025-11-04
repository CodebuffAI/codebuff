/** Python-style range function */
export function* range(start: number, stop?: number, step: number = 1) {
  if (stop === undefined) {
    stop = start
    start = 0
  }

  if (step === 0) {
    throw new Error('Step cannot be zero')
  }

  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      yield i
    }
  } else {
    for (let i = start; i > stop; i += step) {
      yield i
    }
  }
}
