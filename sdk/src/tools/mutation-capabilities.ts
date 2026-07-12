import { getContentHash } from '@codebuff/common/util/content-hash'

import type { WholeFileCapabilityV1 } from '@codebuff/common/tools/results/filesystem'

export function buildFreshWholeFileCapability(
  canonicalPath: string,
  content: string,
): WholeFileCapabilityV1 {
  return {
    kind: 'whole_file',
    version: 1,
    token: `whole.${crypto.randomUUID()}`,
    snapshot: {
      kind: 'file_snapshot',
      version: 1,
      canonicalPath,
      contentHash: getContentHash(content),
      sizeBytes: Buffer.byteLength(content),
      encoding: 'utf8',
      readGeneration: Date.now(),
    },
  }
}
