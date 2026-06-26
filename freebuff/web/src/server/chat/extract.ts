import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'

import {
  CHAT_DOC_MAX_TEXT_CHARS,
  classifyAttachment,
  fileExtension,
} from '@/app/chat/models'

/**
 * Server-side conversion of an uploaded document to LLM-readable text.
 *
 * This is the heart of file upload: a file the model can't read natively (a
 * code file, a CSV, a PDF, a Word doc, a spreadsheet) becomes text the chat
 * agent either reads inline (small files) or searches (large files). Extraction
 * runs once at upload time; the resulting text is what gets persisted, not the
 * original bytes.
 *
 * Plain-text/code formats are decoded as UTF-8. Tabular formats (CSV/TSV/XLSX)
 * are rendered as Markdown tables so the model keeps row/column structure.
 * Binary documents use dedicated parsers: PDF via unpdf (bundled pdf.js), DOCX
 * via mammoth → HTML → Markdown (preserving tables/headings/lists), XLSX via
 * exceljs. New formats plug in through `extractText`'s switch without touching
 * the upload route or the agent.
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

/** Extracts a DOCX as Markdown via mammoth (→ HTML) + turndown with GitHub
 *  tables, so tables, headings, and lists survive rather than being flattened
 *  to plain text. */
async function extractDocx(bytes: ArrayBuffer): Promise<ExtractResult> {
  let html: string
  try {
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })
    html = result.value
  } catch {
    throw new UnsupportedDocumentError(
      'Could not read this Word document. It may be corrupted or an unsupported format (only .docx is supported).',
    )
  }
  const tidied = tidy(htmlToMarkdown(promoteTableHeaders(html)))
  if (tidied.length === 0) {
    throw new EmptyDocumentError()
  }
  return cap(tidied)
}

/** Normalizes mammoth's table HTML for turndown's GFM table rule, which only
 *  converts a table that (a) has a heading row and (b) has single-line cells.
 *  mammoth emits header-less tables whose cells wrap text in `<p>`, so: promote
 *  the first row to a `<thead>` of `<th>` cells, and flatten cell paragraphs
 *  (multi-paragraph cells joined with a space). mammoth's table HTML has no
 *  attributes and doesn't nest, so this structural rewrite is safe here. */
function promoteTableHeaders(html: string): string {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (whole, raw: string) => {
    const inner = raw.replace(/<\/p>\s*<p>/g, ' ').replace(/<\/?p>/g, '')
    const first = inner.match(/<tr>[\s\S]*?<\/tr>/)
    if (!first) return whole
    const head = first[0].replace(/<(\/?)td>/g, '<$1th>')
    const rest = inner.slice(first[0].length)
    return `<table><thead>${head}</thead><tbody>${rest}</tbody></table>`
  })
}

/** Converts HTML to Markdown, preserving tables/lists/headings (GFM). */
function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  td.use(gfm)
  // Don't backslash-escape Markdown punctuation in prose: this text is for an
  // LLM to read and for search_files to grep, so `function_name` must stay
  // intact rather than becoming `function\_name`.
  td.escape = (s: string) => s
  return td.turndown(html)
}

/** Escapes a single table cell for Markdown: pipes escaped, newlines flattened
 *  (a Markdown table cell can't span lines), surrounding whitespace trimmed. */
function escapeCell(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

/** Renders rows of cells as a GitHub-flavored Markdown table. The first row is
 *  the header; short rows are padded so every row has the same column count. */
function rowsToMarkdownTable(rows: string[][]): string {
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0)
  if (cols === 0) return ''
  const pad = (r: string[]) => {
    const c = r.map(escapeCell)
    while (c.length < cols) c.push('')
    return c
  }
  const header = pad(rows[0]!)
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ]
  for (let i = 1; i < rows.length; i++) {
    lines.push(`| ${pad(rows[i]!).join(' | ')} |`)
  }
  return lines.join('\n')
}

/**
 * Parses delimited text (CSV/TSV) into rows of cells, handling quoted fields
 * (embedded delimiters, newlines, and "" escapes) per RFC 4180. CR is dropped
 * so CRLF and LF both delimit rows.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let sawAny = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
      sawAny = true
    } else if (c === delimiter) {
      row.push(field)
      field = ''
      sawAny = true
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      sawAny = false
    } else if (c !== '\r') {
      field += c
      sawAny = true
    }
  }
  if (sawAny || field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Extracts a CSV/TSV file as a Markdown table (preserving columns). */
function extractDelimited(bytes: ArrayBuffer, delimiter: string): ExtractResult {
  const raw = decodeUtf8(bytes)
  if (raw.trim().length === 0) {
    throw new EmptyDocumentError()
  }
  const rows = parseDelimited(raw, delimiter)
  const table = rowsToMarkdownTable(rows)
  if (table.length === 0) {
    throw new EmptyDocumentError()
  }
  return cap(table)
}

/** Extracts an XLSX/XLSM workbook as one Markdown table per non-empty sheet
 *  (headed by the sheet name when there's more than one). */
async function extractXlsx(bytes: ArrayBuffer): Promise<ExtractResult> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(bytes)
  } catch {
    throw new UnsupportedDocumentError(
      'Could not read this spreadsheet. It may be corrupted or an unsupported format (.xlsx/.xlsm only).',
    )
  }
  const multiSheet = workbook.worksheets.length > 1
  const parts: string[] = []
  for (const sheet of workbook.worksheets) {
    const rows: string[][] = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cell.text ?? ''
      })
      rows.push(cells)
    })
    const table = rowsToMarkdownTable(rows)
    if (table.length === 0) continue
    parts.push(multiSheet ? `## ${sheet.name}\n\n${table}` : table)
  }
  const text = parts.join('\n\n')
  if (text.trim().length === 0) {
    throw new EmptyDocumentError('No data found in this spreadsheet.')
  }
  return cap(text)
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
    case '.xlsx':
    case '.xlsm':
      return extractXlsx(bytes)
    case '.csv':
      return extractDelimited(bytes, ',')
    case '.tsv':
      return extractDelimited(bytes, '\t')
    default:
      // Everything else is text on the wire — decode and sanity-check.
      return extractPlainText(bytes)
  }
}
