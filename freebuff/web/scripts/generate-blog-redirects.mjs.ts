/**
 * Generate blog-redirects.mjs for next.config (Node cannot import .ts directly).
 * Run: bun freebuff/web/scripts/generate-blog-redirects.mjs.ts
 */
import { writeFileSync } from 'fs'
import { join } from 'path'

import { getBlogSlugRedirects } from '../src/lib/blog/blog-seo-config'

const redirects = getBlogSlugRedirects()
const out = join(import.meta.dir, '../blog-redirects.mjs')

const body = `// AUTO-GENERATED — run: bun scripts/generate-blog-redirects.mjs.ts
export const blogSlugRedirects = ${JSON.stringify(redirects, null, 2)}
`

writeFileSync(out, body)
console.log('Wrote', redirects.length, 'redirects to blog-redirects.mjs')
