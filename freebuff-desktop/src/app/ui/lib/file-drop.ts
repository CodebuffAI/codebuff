import type { AttachmentKind } from '../../../core/attachments'

// Drives the chip icon only; the server re-derives the authoritative kind.
// Keep in sync with IMAGE_EXTS in app/attachments.ts.
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i

export const baseName = (p: string) => p.split(/[\\/]/).pop() || p

export function kindFor(name: string, isDirectory: boolean, mime?: string): AttachmentKind {
  if (isDirectory) return 'directory'
  if (mime?.startsWith('image/') || IMAGE_RE.test(name)) return 'image'
  return 'file'
}
