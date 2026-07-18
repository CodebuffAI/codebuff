import { isMandatorySensitiveReadPath } from '@codebuff/common/util/sensitive-paths'

import type { FileFilter } from './read-files'

export function isReadPathBlocked(
  filePath: string,
  fileFilter?: FileFilter,
): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  const aliases = [...new Set([normalized, normalized.toLowerCase()])]
  return (
    aliases.some(isMandatorySensitiveReadPath) ||
    Boolean(
      fileFilter &&
      aliases.some((alias) => fileFilter(alias).status === 'blocked'),
    )
  )
}
