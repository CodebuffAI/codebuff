// max 10 length string. For longer, concat multiple
// Often used as a unique identifier.
export const randomString = (length = 10) =>
  Math.random()
    .toString(36)
    .substring(2, length + 2)

// Matches the output of the randomString function, for validation purposes.
export const randomStringRegex = /^[0-9a-z]+$/

export function genHash(str: string) {
  // xmur3

  // Route around compiler bug by using object?
  const o = { h: 1779033703 ^ str.length }

  for (let i = 0; i < str.length; i++) {
    let h = o.h
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
    o.h = h
  }
  return function () {
    let h = o.h
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

export function createRNG(seed: string) {
  // https://stackoverflow.com/a/47593316/1592933

  const gen = genHash(seed)
  let [a, b, c, d] = [gen(), gen(), gen(), gen()]

  // sfc32
  return function () {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

export const shuffle = (array: unknown[], rand: () => number) => {
  for (let i = 0; i < array.length; i++) {
    const swapIndex = i + Math.floor(rand() * (array.length - i))
    ;[array[i], array[swapIndex]] = [array[swapIndex], array[i]]
  }
}
