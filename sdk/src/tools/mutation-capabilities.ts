import {
  encodeReadCapabilityToken,
  getContentHash,
  getExactContentHash,
  normalizeLineEndings,
} from '@codebuff/common/util/content-hash'

import type { WholeFileCapabilityV1 } from '@codebuff/common/tools/results/filesystem'
import type { ReadCapabilityIssuer } from '@codebuff/common/util/content-hash'

export function buildFreshWholeFileCapability(params: {
  canonicalPath: string
  path: string
  content: string
  capabilityIssuer: ReadCapabilityIssuer
}): WholeFileCapabilityV1 {
  const { canonicalPath, path, content, capabilityIssuer } = params
  const readContentHash = getContentHash(content)
  const snapshotContentHash = getExactContentHash(content)
  const endLine = normalizeLineEndings(content).split('\n').length
  return {
    kind: 'whole_file',
    version: 1,
    token: encodeReadCapabilityToken({
      startLine: 1,
      endLine,
      hash: readContentHash,
      scope: {
        ...capabilityIssuer,
        path,
      },
    }),
    snapshot: {
      kind: 'file_snapshot',
      version: 1,
      canonicalPath,
      contentHash: snapshotContentHash,
      sizeBytes: Buffer.byteLength(content),
      encoding: 'utf8',
      readGeneration: Date.now(),
    },
  }
}
