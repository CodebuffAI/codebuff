import { createReadStream, promises as nodeFs } from 'node:fs'

import type {
  CodebuffFileSystem,
  CodebuffTextRangeReadResult,
} from '@codebuff/common/types/filesystem'
import type { PathLike } from 'node:fs'

/**
 * Node's default filesystem with the bounded range capability required by
 * `read_files.ranges` for oversized files. The implementation streams the
 * file, so returned content is memory-bounded even though total line metadata
 * is computed from the same complete snapshot.
 */
export function createNodeFileSystem(): CodebuffFileSystem {
  return Object.assign(Object.create(nodeFs), {
    hostProcessView: true,
    readTextRange: readNodeTextRange,
    createFileExclusive: async (
      filePath: PathLike,
      data: Parameters<CodebuffFileSystem['writeFile']>[1],
    ) => nodeFs.writeFile(filePath, data, { flag: 'wx' }),
    renameFile: (source: PathLike, destination: PathLike) =>
      nodeFs.rename(source, destination),
    setMode: (filePath: PathLike, mode: number) => nodeFs.chmod(filePath, mode),
  }) as CodebuffFileSystem
}

async function readNodeTextRange(
  filePath: PathLike,
  startLine: number,
  endLine: number,
  maxBytes: number,
): Promise<CodebuffTextRangeReadResult> {
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    !Number.isSafeInteger(maxBytes) ||
    startLine < 1 ||
    endLine < startLine ||
    maxBytes < 1
  ) {
    throw new RangeError('Invalid bounded text range request')
  }

  const output: Buffer[] = []
  let outputBytes = 0
  let currentLine = 1
  let returnedStartLine = 0
  let returnedEndLine = 0
  let currentParts: Buffer[] = []
  let currentBytes = 0
  let truncated = false
  let sawBytes = false
  let endedWithNewline = false

  const finishLine = (line: Buffer): void => {
    if (currentLine >= startLine && currentLine <= endLine && !truncated) {
      if (outputBytes + line.byteLength > maxBytes) {
        truncated = true
      } else {
        if (returnedStartLine === 0) returnedStartLine = currentLine
        returnedEndLine = currentLine
        output.push(line)
        outputBytes += line.byteLength
      }
    }
    currentLine += 1
    currentParts = []
    currentBytes = 0
  }

  for await (const chunkValue of createReadStream(filePath)) {
    const chunk = Buffer.isBuffer(chunkValue)
      ? chunkValue
      : Buffer.from(chunkValue)
    if (chunk.byteLength === 0) continue
    sawBytes = true
    let offset = 0
    for (let index = 0; index < chunk.byteLength; index += 1) {
      if (chunk[index] !== 0x0a) continue
      const part = chunk.subarray(offset, index + 1)
      currentParts.push(part)
      currentBytes += part.byteLength
      finishLine(Buffer.concat(currentParts, currentBytes))
      offset = index + 1
    }
    if (offset < chunk.byteLength) {
      const part = chunk.subarray(offset)
      currentParts.push(part)
      currentBytes += part.byteLength
      endedWithNewline = false
    } else {
      endedWithNewline = true
    }
  }

  if (currentBytes > 0) {
    finishLine(Buffer.concat(currentParts, currentBytes))
  }

  const totalLines = !sawBytes
    ? 0
    : endedWithNewline
      ? currentLine - 1
      : currentLine - 1
  const requestedLastExistingLine = Math.min(endLine, totalLines)
  const complete =
    !truncated &&
    (requestedLastExistingLine < startLine ||
      returnedEndLine === requestedLastExistingLine)

  return {
    data: Buffer.concat(output, outputBytes),
    startLine: returnedStartLine || startLine,
    endLine: returnedEndLine,
    totalLines,
    complete,
  }
}
