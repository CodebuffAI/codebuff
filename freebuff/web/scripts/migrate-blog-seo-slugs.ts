/**
 * Migrate blog post files to SEO-optimized slugs and fix internal links.
 * Run: bun freebuff/web/scripts/migrate-blog-seo-slugs.ts
 */
import { existsSync, readFileSync, renameSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

import { blogSeoEntries } from '../src/lib/blog/blog-seo-config'

const POSTS_DIR = join(import.meta.dir, '../src/lib/blog/posts')

function updateSlugInFile(path: string, newSlug: string) {
  let content = readFileSync(path, 'utf8')
  content = content.replace(/slug: '[^']+'/, `slug: '${newSlug}'`)
  writeFileSync(path, content)
}

function migrateFile(oldSlug: string | undefined, newSlug: string) {
  if (!oldSlug || oldSlug === newSlug) {
    const direct = join(POSTS_DIR, `${newSlug}.ts`)
    if (existsSync(direct)) {
      updateSlugInFile(direct, newSlug)
      return
    }
    return
  }
  const oldPath = join(POSTS_DIR, `${oldSlug}.ts`)
  const newPath = join(POSTS_DIR, `${newSlug}.ts`)
  if (!existsSync(oldPath)) {
    if (existsSync(newPath)) {
      updateSlugInFile(newPath, newSlug)
      return
    }
    console.warn('missing:', oldSlug)
    return
  }
  renameSync(oldPath, newPath)
  updateSlugInFile(newPath, newSlug)
  console.log(`${oldSlug} → ${newSlug}`)
}

// 1. Rename comparison + savings files
for (const e of blogSeoEntries) {
  migrateFile(e.legacyComparisonSlug, e.comparisonSlug)
  if (e.savingsSlug) {
    migrateFile(e.legacySavingsSlug, e.savingsSlug)
  }
}

// 2. Fix internal /blog/ links across all posts
const slugMap = new Map<string, string>()
for (const e of blogSeoEntries) {
  if (e.legacyComparisonSlug) slugMap.set(e.legacyComparisonSlug, e.comparisonSlug)
  if (e.legacySavingsSlug && e.savingsSlug) slugMap.set(e.legacySavingsSlug, e.savingsSlug)
}

for (const file of readdirSync(POSTS_DIR)) {
  if (!file.endsWith('.ts')) continue
  const path = join(POSTS_DIR, file)
  let content = readFileSync(path, 'utf8')
  let changed = false
  for (const [oldSlug, newSlug] of slugMap) {
    const needle = `/blog/${oldSlug}`
    const replacement = `/blog/${newSlug}`
    if (content.includes(needle)) {
      content = content.split(needle).join(replacement)
      changed = true
    }
  }
  if (changed) {
    writeFileSync(path, content)
    console.log('updated links:', file)
  }
}

console.log('Slug migration complete.')
