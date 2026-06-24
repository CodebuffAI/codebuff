/**
 * Patch comparison + savings blog posts with expanded SEO keywords.
 * Run: bun freebuff/web/scripts/patch-blog-seo-keywords.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { blogSeoEntries } from '../src/lib/blog/blog-seo-config'
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
  const entry = blogSeoEntries.find((e) => e.id === id)
  const comparisonFile = entry
    ? join(POSTS_DIR, `${entry.comparisonSlug}.ts`)
    : join(POSTS_DIR, `free-alternative-to-${id}.ts`)
  if (!existsSync(comparisonFile)) continue
  try {
    const content = readFileSync(comparisonFile, 'utf8')
    writeFileSync(comparisonFile, replaceKeywordsBlock(content, keywords))
    patched++
    console.log('comparison:', id)
  } catch (e) {
    console.warn('comparison failed:', id, e)
  }

  if (!entry?.savingsSlug) continue
  const savingsFile = join(POSTS_DIR, `${entry.savingsSlug}.ts`)
  if (!existsSync(savingsFile)) continue
  try {
    const content = readFileSync(savingsFile, 'utf8')
    writeFileSync(savingsFile, replaceKeywordsBlock(content, savingsKeywordsFor(id)))
    patched++
    console.log('savings:', id)
  } catch (e) {
    console.warn('savings failed:', id, e)
  }
}

console.log(`\nPatched ${patched} files.`)
