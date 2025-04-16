type PlainObject = Record<string, any>

interface Chunk<T> {
  data: T
  length: number
}

function isPlainObject(val: any): val is PlainObject {
  return (
    typeof val === 'object' &&
    val !== null &&
    Object.getPrototypeOf(val) === Object.prototype
  )
}

function getJsonSize(data: any): number {
  if (data === undefined) {
    return 'undefined'.length
  }
  const size = JSON.stringify(data).length
  return size
}

function splitString(data: string, maxSize: number): Chunk<string>[] {
  if (data === '') {
    return [{ data: '', length: 2 }]
  }

  const chunks: Chunk<string>[] = []
  let currentChunk: Chunk<string> = { data: '', length: 2 }

  if (maxSize < 2) {
    for (let i = 0; i < data.length; i++) {
      chunks.push({ data: data[i], length: getJsonSize(data[i]) })
    }
    return chunks
  }

  for (let i = 0; i < data.length; i++) {
    const char = data[i]
    const charSizeContribution = JSON.stringify(char).length - 2
    let potentialNextSize: number

    potentialNextSize = currentChunk.length + charSizeContribution

    if (potentialNextSize <= maxSize) {
      currentChunk.data += char
      currentChunk.length = potentialNextSize
    } else {
      if (currentChunk.data !== '') {
        chunks.push(currentChunk)
      }

      currentChunk = { data: char, length: 2 + charSizeContribution }
    }
  }

  if (currentChunk.data !== '') {
    chunks.push(currentChunk)
  }

  return chunks
}

function splitObject(obj: PlainObject, maxSize: number): Chunk<PlainObject>[] {
  const chunks: Chunk<PlainObject>[] = []

  let currentChunk: Chunk<PlainObject> = {
    data: {},
    length: 2,
  }
  for (const [key, value] of Object.entries(obj)) {
    const entryObject = { [key]: value }
    const standaloneEntry: Chunk<PlainObject> = {
      data: entryObject,
      length: getJsonSize(entryObject),
    }

    if (standaloneEntry.length > maxSize) {
      const overhead = getJsonSize({ [key]: '' }) - 2

      const items = splitDataWithLengths(
        value,
        maxSize - (getJsonSize({ [key]: '' }) - 2)
      )

      for (const [index, item] of items.entries()) {
        const itemWithKey: Chunk<any> = {
          data: { [key]: item.data },
          length: item.length + overhead,
        }

        if (index < items.length - 1) {
          if (key in currentChunk.data) {
            chunks.push(currentChunk)
            currentChunk = itemWithKey
            continue
          }

          const candidateChunkLength =
            currentChunk.length +
            itemWithKey.length -
            (currentChunk.length === 2 ? 2 : 3)
          if (candidateChunkLength <= maxSize) {
            currentChunk.data[key] = item.data
            currentChunk.length = candidateChunkLength
            continue
          }

          if (currentChunk.length > 2) {
            chunks.push(currentChunk)
          }
          currentChunk = itemWithKey
          continue
        }

        if (currentChunk.length > 2) {
          chunks.push(currentChunk)
        }
        currentChunk = itemWithKey
      }

      continue
    }

    const candidateChunkLength =
      currentChunk.length +
      standaloneEntry.length -
      (currentChunk.length === 2 ? 2 : 3)

    if (candidateChunkLength <= maxSize) {
      currentChunk.data[key] = value
      currentChunk.length = candidateChunkLength
      continue
    }

    if (currentChunk.length > 2) {
      chunks.push(currentChunk)
      currentChunk = standaloneEntry
    }
  }

  if (currentChunk.length > 2) {
    chunks.push(currentChunk)
  }

  return chunks
}

function splitArray(arr: any[], maxSize: number): Chunk<any[]>[] {
  const chunks: Chunk<any[]>[] = []
  let currentChunk: Chunk<any[]> = { data: [], length: 2 }

  for (const element of arr) {
    const entryArr = [element]
    const standaloneEntry: Chunk<any[]> = {
      data: entryArr,
      length: getJsonSize(entryArr),
    }

    if (standaloneEntry.length > maxSize) {
      if (currentChunk.length > 2) {
        chunks.push(currentChunk)
      }

      const items = splitDataWithLengths(element, maxSize - 2)

      for (const [index, item] of items.entries()) {
        if (index < items.length - 1) {
          // Try to add to current chunk
          const candidateChunkLength =
            currentChunk.length +
            item.length +
            (currentChunk.length === 2 ? 1 : 0)
          if (candidateChunkLength <= maxSize) {
            currentChunk.data.push(item.data)
            currentChunk.length = candidateChunkLength
            continue
          }

          chunks.push({ data: [item.data], length: item.length + 2 })
          continue
        }

        currentChunk = { data: [item.data], length: item.length + 2 }
      }
      continue
    }

    const candidateChunkLength =
      currentChunk.length +
      standaloneEntry.length -
      (currentChunk.length === 2 ? 1 : 2)

    if (candidateChunkLength <= maxSize) {
      currentChunk.data.push(element)
      currentChunk.length = candidateChunkLength
      continue
    }

    if (currentChunk.length > 2) {
      chunks.push(currentChunk)
      currentChunk = standaloneEntry
    }
  }

  if (currentChunk.length > 2) {
    chunks.push(currentChunk)
  }

  return chunks
}

function splitDataWithLengths(data: any, maxChunkSize: number): Chunk<any>[] {
  // Handle primitives
  if (typeof data !== 'object' || data === null) {
    if (typeof data === 'string') {
      const result = splitString(data, maxChunkSize)
      return result
    }
    return [{ data, length: getJsonSize(data) }]
  }

  // Non-plain objects (Date, RegExp, etc.)
  if (!Array.isArray(data) && !isPlainObject(data)) {
    return [{ data, length: getJsonSize(data) }]
  }

  // Arrays
  if (Array.isArray(data)) {
    const result = splitArray(data, maxChunkSize)
    return result
  }

  // Plain objects
  const result = splitObject(data, maxChunkSize)
  return result
}

export function splitData(data: any, maxChunkSize: number = 99_000): any[] {
  return splitDataWithLengths(data, maxChunkSize).map((cwjl) => cwjl.data)
}
