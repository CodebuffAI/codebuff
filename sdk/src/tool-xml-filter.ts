import { endToolTag, startToolTag } from '@codebuff/common/tools/constants'
import { suffixPrefixOverlap } from '@codebuff/common/util/string'

export function* filterXml(params: {
  chunk: string
  buffer: string
}): Generator<{ chunk: string }, { buffer: string }> {
  const { chunk } = params
  let { buffer } = params

  buffer += chunk
  let startToolTagIndex = buffer.indexOf(startToolTag)
  let endToolTagIndex = buffer.indexOf(endToolTag)

  while (endToolTagIndex !== -1) {
    if (startToolTagIndex > endToolTagIndex || startToolTagIndex === -1) {
      // End tag found before start tag: unexpected state, just flush to end tag
      yield { chunk: buffer.slice(0, endToolTagIndex + endToolTag.length) }
      buffer = buffer.slice(endToolTagIndex + endToolTag.length)
      startToolTagIndex = buffer.indexOf(startToolTag)
      endToolTagIndex = buffer.indexOf(endToolTag)
      continue
    }

    // Start tag found before end tag - tool call found
    if (startToolTagIndex > 0) {
      yield { chunk: buffer.slice(0, startToolTagIndex) }
    }
    buffer = buffer.slice(endToolTagIndex + endToolTag.length)
    startToolTagIndex = buffer.indexOf(startToolTag)
    endToolTagIndex = buffer.indexOf(endToolTag)
    continue
  } // no more end tags

  // cut to first start tag
  if (startToolTagIndex !== -1) {
    if (startToolTagIndex > 0) {
      yield { chunk: buffer.slice(0, startToolTagIndex) }
    }
    return { buffer: buffer.slice(startToolTagIndex) }
  }

  // partial start tag
  const overlap = suffixPrefixOverlap(buffer, startToolTag)
  if (overlap.length < buffer.length) {
    yield { chunk: buffer.slice(0, buffer.length - overlap.length) }
    buffer = overlap
  }

  return { buffer }
}
