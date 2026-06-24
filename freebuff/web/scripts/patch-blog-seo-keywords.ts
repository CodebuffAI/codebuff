/**
 * Patch comparison + savings blog posts with expanded SEO keywords.
 * Run: bun freebuff/web/scripts/patch-blog-seo-keywords.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import {
  comparisonKeywordsById,
  formatKeywordsArray,
  savingsKeywordsFor,
} from '../src/lib/blog/competitor-seo-keywords'

const POSTS_DIR = join(import.meta.dir, '../src/lib/blog/posts')

function replaceKeywordsBlock(content: string, keywords: string[]): string {
  const replacement = formatKeywordsArray(keywords)
  const pattern = /keywords:\s*\[[\s\S]*?\],/
  if (!pattern.test(content)) {
    throw new Error('Could not find keywords block')
  }
  return content.replace(pattern, replacement)
}

let patched = 0

for (const [id, keywords] of Object.entries(comparisonKeywordsById)) {
  const comparisonFile = join(POSTS_DIR, `free-alternative-to-${id}.ts`)
  try {
    const content = readFileSync(comparisonFile, 'utf8')
    writeFileSync(comparisonFile, replaceKeywordsBlock(content, keywords))
    patched++
    console.log('comparison:', id)
  } catch {
    console.log('skip comparison (missing):', id)
  }

  const savingsGlob = `how-one-${id}-user-saved-`
  const savingsFile = readdirSync(POSTS_DIR).find(
    (f) => f.startsWith(savingsGlob) && f.endsWith('-switching-to-freebuff.ts'),
  )
  if (savingsFile) {
    const path = join(POSTS_DIR, savingsFile)
    const content = readFileSync(path, 'utf8')
    writeFileSync(path, replaceKeywordsBlock(content, savingsKeywordsFor(id)))
    patched++
    console.log('savings:', id)
  }
}

console.log(`\nPatched ${patched} files.`)
