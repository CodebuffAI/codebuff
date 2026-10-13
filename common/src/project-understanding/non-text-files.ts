/**
 * Files the project-understanding agent never reads: not text, not code. Shared by the
 * SDK's opt-in read guard (`RunOptions.refuseNonTextFileReads`), the Cloud
 * project-understanding agent's read_files wrapper and Desktop's line counting, so all three
 * refuse the same files (docs/freebuff-project-understanding.md).
 *
 * Project-understanding-only on purpose: it lives under project-understanding/ so no other read
 * path picks it up. No node:path here: this module also runs where Node's
 * built-ins do not.
 */

/** Lower-case extensions, with the dot. SVG is XML text, so it is not here. */
export const PROJECT_UNDERSTANDING_NON_TEXT_EXTENSIONS: ReadonlySet<string> =
  new Set([
    // images
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.ico',
    '.icns',
    '.tif',
    '.tiff',
    '.heic',
    '.heif',
    '.avif',
    '.psd',
    // documents
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.key',
    '.numbers',
    '.pages',
    '.odt',
    '.ods',
    '.odp',
    '.epub',
    // archives
    '.zip',
    '.tar',
    '.gz',
    '.tgz',
    '.bz2',
    '.xz',
    '.zst',
    '.7z',
    '.rar',
    '.jar',
    '.war',
    // media
    '.mp3',
    '.mp4',
    '.m4v',
    '.mov',
    '.avi',
    '.mkv',
    '.wmv',
    '.wav',
    '.flac',
    '.ogg',
    '.webm',
    '.m4a',
    '.aac',
    // fonts
    '.ttf',
    '.otf',
    '.woff',
    '.woff2',
    '.eot',
    // binaries and objects
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.o',
    '.obj',
    '.a',
    '.lib',
    '.class',
    '.wasm',
    '.pyc',
    '.pyo',
    // databases
    '.sqlite',
    '.sqlite3',
    '.db',
    // disk images
    '.dmg',
    '.iso',
    '.img',
  ])

/** How much of a file's start the binary sniff looks at. */
export const PROJECT_UNDERSTANDING_BINARY_SNIFF_BYTES = 4096

function extensionOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const base = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot) : ''
}

/** Whether a path names a non-text file by its extension. Paths only: no read. */
export function isProjectUnderstandingNonTextPath(filePath: string): boolean {
  return PROJECT_UNDERSTANDING_NON_TEXT_EXTENSIONS.has(extensionOf(filePath))
}

/**
 * Whether a file's start looks binary: a NUL in its first
 * PROJECT_UNDERSTANDING_BINARY_SNIFF_BYTES. Takes the raw bytes, or the text as
 * decoded (UTF-8 decodes a NUL byte to U+0000, so the answer is the same).
 */
export function looksLikeBinaryContent(content: Uint8Array | string): boolean {
  if (typeof content === 'string') {
    return content
      .slice(0, PROJECT_UNDERSTANDING_BINARY_SNIFF_BYTES)
      .includes('\u0000')
  }
  return content
    .subarray(0, PROJECT_UNDERSTANDING_BINARY_SNIFF_BYTES)
    .includes(0)
}

/** What a refused non-text read says, after the status, so the model moves on. */
export const PROJECT_UNDERSTANDING_NON_TEXT_MESSAGE =
  '[Not a text file. Only text and code files can be read; images, PDFs, archives, office documents, media, fonts, binaries and databases are refused.]'

/** What a refused read outside the project says, after the status. */
export const PROJECT_UNDERSTANDING_OUTSIDE_PROJECT_MESSAGE =
  '[Outside the project. Only files inside the project directory can be read.]'
