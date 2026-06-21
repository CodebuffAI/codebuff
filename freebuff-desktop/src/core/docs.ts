/**
 * Governing-doc store (§10.1, §10.2). Docs are NOT database rows — they are
 * markdown files under `<project>/.freebuff/docs/<name>.md`, so they're versioned,
 * diffable, and reviewed like code.
 *
 * Leanness is enforced by a **hard per-doc length cap** (§10.2): an edit that
 * pushes a doc past its cap can't be saved/merged, forcing the machine to condense
 * or prune. The cap is a save-time gate here and a merge gate in the pipeline.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { DOC_NAMES, type DocName } from './types'

/** Default cap: ~400 lines / ~16 KB per doc (§10.2), tunable per doc. */
export const DEFAULT_DOC_CAP = { lines: 400, bytes: 16 * 1024 }

export interface DocCap {
  lines: number
  bytes: number
}

export class DocCapError extends Error {
  constructor(
    readonly doc: DocName,
    readonly actual: DocCap,
    readonly cap: DocCap,
  ) {
    super(
      `Doc "${doc}" exceeds its length cap (${actual.lines} lines / ${actual.bytes} bytes ` +
        `vs. cap ${cap.lines} lines / ${cap.bytes} bytes). Condense or prune before saving.`,
    )
    this.name = 'DocCapError'
  }
}

export class DocStore {
  private readonly docsDir: string
  private readonly caps: Partial<Record<DocName, DocCap>>

  constructor(opts: { docsDir: string; caps?: Partial<Record<DocName, DocCap>> }) {
    this.docsDir = opts.docsDir
    this.caps = opts.caps ?? {}
  }

  path(name: DocName): string {
    return join(this.docsDir, `${name}.md`)
  }

  capFor(name: DocName): DocCap {
    return this.caps[name] ?? DEFAULT_DOC_CAP
  }

  /** Returns the doc's content, or '' if it hasn't been created yet. */
  read(name: DocName): string {
    const p = this.path(name)
    return existsSync(p) ? readFileSync(p, 'utf8') : ''
  }

  /** Cheap presence check — avoids reading the whole file just to test for content. */
  exists(name: DocName): boolean {
    return existsSync(this.path(name))
  }

  measure(content: string): DocCap {
    return {
      lines: content.length === 0 ? 0 : content.split('\n').length,
      bytes: Buffer.byteLength(content, 'utf8'),
    }
  }

  /** True if `content` would exceed the doc's cap on either dimension. */
  exceedsCap(name: DocName, content: string): boolean {
    const cap = this.capFor(name)
    const actual = this.measure(content)
    return actual.lines > cap.lines || actual.bytes > cap.bytes
  }

  /** Write a doc, enforcing the length cap (§10.2). Throws `DocCapError` if over. */
  write(name: DocName, content: string): void {
    if (this.exceedsCap(name, content)) {
      throw new DocCapError(name, this.measure(content), this.capFor(name))
    }
    mkdirSync(this.docsDir, { recursive: true })
    writeFileSync(this.path(name), content)
  }

  static isDocName(name: string): name is DocName {
    return (DOC_NAMES as readonly string[]).includes(name)
  }
}
