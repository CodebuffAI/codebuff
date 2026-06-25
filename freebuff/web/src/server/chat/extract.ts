import mammoth from 'mammoth'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'

import {
  CHAT_DOC_MAX_TEXT_CHARS,
  classifyAttachment,
  fileExtension,
} from '@/app/chat/models'

/**
 * Server-side conversion of an uploaded document to LLM-readable plain text.
 *
 * This is the heart of file upload: a file the model can't read natively (a
 * code file, a CSV, a PDF, a Word doc) becomes UTF-8 text that the chat agent
 * either reads inline (small files) or searches (large files). Extraction runs
 * once at upload time; the resulting text is what gets persisted, not the
 * original bytes.
 *
 * Plain-text/code/data formats are decoded as UTF-8. Binary formats are handled
 * by dedicated parsers: PDF via unpdf (bundled pdf.js) and DOCX via mammoth.
 * New formats plug in through `extractText`'s switch without touching the
 * upload route or the agent.
 */

export interface ExtractResult {
  /** The extracted text, already capped to CHAT_DOC_MAX_TEXT_CHARS. */
  text: string
  /** True when the source was longer than the cap and the tail was dropped. */
  truncated: boolean
}

export class UnsupportedDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedDocumentError'
  }
}

export class EmptyDocumentError extends Error {
  constructor(message = 'The file appears to be empty.') {
    super(message)
    this.name = 'EmptyDocumentError'
  }
}

/**
 * Heuristic binary check: real text files decode cleanly, while binary files
 * (an image renamed .txt, a compiled blob) are riddled with NUL bytes and
 * U+FFFD replacement chars after a UTF-8 decode. We sample the decoded head so
 * the check is O(1) on huge files.
 */
function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096)
  if (sample.length === 0) return false
  if (sample.includes('\u0000')) return true
  let replacements = 0
  for (let i = 0; i < sample.length; i++) {
    if (sample.charCodeAt(i) === 0xfffd) replacements++
  }
  return replacements / sample.length > 0.1
}

/** Decodes bytes as UTF-8 (fatal=false so a stray bad byte becomes U+FFFD
 *  rather than throwing), strips a BOM, and normalizes CRLF → LF. */
function decodeUtf8(bytes: ArrayBuffer): string {
  const decoded = new TextDecoder('utf-8').decode(bytes)
  const noBom = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded
  return noBom.replace(/\r\n/g, '\n')
}

/** Applies the per-document text cap, reporting whether anything was dropped. */
function cap(text: string): ExtractResult {
  if (text.length <= CHAT_DOC_MAX_TEXT_CHARS) {
    return { text, truncated: false }
  }
  return { text: text.slice(0, CHAT_DOC_MAX_TEXT_CHARS), truncated: true }
}

/** Extracts a plain-text document (txt/code/csv/json/…): decode + sanity-check. */
function extractPlainText(bytes: ArrayBuffer): ExtractResult {
  const text = decodeUtf8(bytes)
  if (text.trim().length === 0) {
    throw new EmptyDocumentError()
  }
  if (looksBinary(text)) {
    throw new UnsupportedDocumentError(
      "This file doesn't look like readable text. Supported files include text, code, CSV, JSON, Markdown, PDF, and Word documents.",
    )
  }
  return cap(text)
}

/** Collapses runs of 3+ blank lines (common in PDF text layers) down to one,
 *  and trims trailing whitespace per line — keeps extracted text compact. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extracts a PDF's text layer via unpdf (bundled pdf.js). Image-only/scanned
 *  PDFs have no text layer and surface as EmptyDocumentError (OCR is future
 *  work); password-protected or corrupt PDFs surface as
 *  UnsupportedDocumentError. */
async function extractPdf(bytes: ArrayBuffer): Promise<ExtractResult> {
  let text: string
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const result = await extractPdfText(pdf, { mergePages: true })
    text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text
  } catch {
    throw new UnsupportedDocumentError(
      'Could not read this PDF. It may be password-protected or corrupted.',
    )
  }
  const tidied = tidy(text)
  if (tidied.length === 0) {
    throw new EmptyDocumentError(
      'No text found in this PDF. Scanned/image-only PDFs are not yet supported.',
    )
  }
  return cap(tidied)
}

/** Extracts a DOCX's raw text via mammoth (drops styling/structure, keeps
 *  paragraphs). */
async function extractDocx(bytes: ArrayBuffer): Promise<ExtractResult> {
  let text: string
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    text = result.value
  } catch {
    throw new UnsupportedDocumentError(
      'Could not read this Word document. It may be corrupted or an unsupported format (only .docx is supported).',
    )
  }
  const tidied = tidy(text)
  if (tidied.length === 0) {
    throw new EmptyDocumentError()
  }
  return cap(tidied)
}

/**
 * Converts an uploaded document to text. Throws UnsupportedDocumentError for
 * formats we don't handle and EmptyDocumentError for blank files; callers map
 * those to 4xx responses.
 *
 * `mediaType` is the browser-reported MIME (unreliable for code) and `fileName`
 * carries the extension we actually trust — see classifyAttachment.
 */
export async function extractText(params: {
  bytes: ArrayBuffer
  mediaType: string
  fileName: string
}): Promise<ExtractResult> {
  const { bytes, mediaType, fileName } = params
  if (classifyAttachment(fileName, mediaType) !== 'document') {
    throw new UnsupportedDocumentError('This file type is not supported.')
  }

  const ext = fileExtension(fileName)
  switch (ext) {
    case '.pdf':
      return extractPdf(bytes)
    case '.docx':
      return extractDocx(bytes)
    default:
      // Everything else is text on the wire — decode and sanity-check.
      return extractPlainText(bytes)
  }
}
