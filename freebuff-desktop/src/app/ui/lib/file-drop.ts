import type { AttachmentKind } from '../../../core/attachments'

// Drives the chip icon only; the server re-derives the authoritative kind.
// Keep in sync with IMAGE_EXTS in app/attachments.ts.
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i

/** Last path segment (either separator), tolerating trailing slashes. The one
 *  basename helper for the UI — attachment chips, the thread-header folder
 *  pill, and the welcome screen's recents all use it, so folder names can't
 *  render differently across surfaces. */
export const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p

/** Everything before the last path segment (either separator), tolerating
 *  trailing slashes — the parent directory shown muted next to a baseName so
 *  the folder name isn't repeated. Root-level paths keep their root ("/" or
 *  "C:\"); a bare name returns ''. */
export const dirName = (p: string) => {
  const trimmed = p.replace(/[\\/]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (idx < 0) return ''
  return trimmed.slice(0, idx) || trimmed[0]
}

export function kindFor(name: string, isDirectory: boolean, mime?: string): AttachmentKind {
  if (isDirectory) return 'directory'
  if (mime?.startsWith('image/') || IMAGE_RE.test(name)) return 'image'
  return 'file'
}
