import { createHash } from 'node:crypto'

/**
 * Canonical CRLF→LF normalization shared by the read/edit toolchain so that
 * file-content hashes are stable across Windows/Unix checkouts.
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

/**
 * Canonical sha256 content hash used by `read_files`, `apply_patch`,
 * `replace_range`, and `str_replace` for stale-edit / capability-token
 * validation. The hash is computed over the normalized (LF) content and
 * prefixed with `sha256:` so callers can distinguish it from legacy hashes.
 */
export function getContentHash(content: string): string {
  return `sha256:${createHash('sha256').update(normalizeLineEndings(content)).digest('hex')}`
}
