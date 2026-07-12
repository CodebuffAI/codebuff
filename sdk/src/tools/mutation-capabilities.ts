import {
  encodeReadCapabilityToken,
  getContentHash,
  normalizeLineEndings,
} from '@codebuff/common/util/content-hash'

import type { WholeFileCapabilityV1 } from '@codebuff/common/tools/results/filesystem'

export function buildFreshWholeFileCapability(
  canonicalPath: string,
  content: string,
): WholeFileCapabilityV1 {
  const contentHash = getContentHash(content)
  const endLine = normalizeLineEndings(content).split('\n').length
  return {
    kind: 'whole_file',
    version: 1,
    // Whole-file mutation results are also fresh reads of the committed
    // content. Emit the same stateless cap.* token format accepted by
    // basedOnRead so models can safely reuse the one visible capability
    // instead of confusing a separate whole.* namespace with read authority.
    token: encodeReadCapabilityToken({
      startLine: 1,
      endLine,
      hash: contentHash,
    }),
    snapshot: {
      kind: 'file_snapshot',
      version: 1,
      canonicalPath,
      contentHash,
      sizeBytes: Buffer.byteLength(content),
      encoding: 'utf8',
      readGeneration: Date.now(),
    },
  }
}
