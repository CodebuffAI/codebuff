/**
 * Content Integrity Tests for Documentation
 *
 * These tests validate that all MDX documentation files are well-formed,
 * have required frontmatter, and internal links are valid.
 */

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const CONTENT_DIR = path.join(process.cwd(), 'src/content')
const VALID_SECTIONS = ['help', 'tips', 'advanced', 'agents', 'walkthroughs', 'case-studies']

// Get all MDX files recursively
function getMdxFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getMdxFiles(fullPath))
    } else if (entry.name.endsWith('.mdx') && !entry.name.startsWith('_')) {
      files.push(fullPath)
    }
  }

  return files
}

// Extract internal links from MDX content
function extractInternalLinks(content: string): string[] {
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g
  const links: string[] = []
  let match

  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2]
    // Only collect internal links (starting with / or relative paths to docs)
    if (url.startsWith('/docs/') || url.startsWith('/publishers/') || url.startsWith('/pricing') || url.startsWith('/store')) {
      links.push(url)
    }
  }

  return links
}

describe('Documentation Content Integrity', () => {
  let mdxFiles: string[]

  beforeAll(() => {
    mdxFiles = getMdxFiles(CONTENT_DIR)
  })

  describe('MDX Files Exist', () => {
    it('should have at least one MDX file', () => {
      expect(mdxFiles.length).toBeGreaterThan(0)
    })

    it('should have files in expected sections', () => {
      const categories = new Set(
        mdxFiles.map((f) => {
          const relative = path.relative(CONTENT_DIR, f)
          return relative.split(path.sep)[0]
        })
      )

      // At least some expected sections should exist
      const hasExpectedSections = VALID_SECTIONS.some((section) =>
        categories.has(section)
      )
      expect(hasExpectedSections).toBe(true)
    })
  })

  describe('Frontmatter Validation', () => {
    it.each(
      getMdxFiles(CONTENT_DIR).map((f) => [path.relative(CONTENT_DIR, f), f])
    )('%s has valid frontmatter', (relativePath, filePath) => {
      const content = fs.readFileSync(filePath as string, 'utf-8')
      const { data: frontmatter } = matter(content)

      // Required fields
      expect(frontmatter.title).toBeDefined()
      expect(typeof frontmatter.title).toBe('string')
      expect(frontmatter.title.length).toBeGreaterThan(0)

      expect(frontmatter.section).toBeDefined()
      expect(typeof frontmatter.section).toBe('string')
      expect(VALID_SECTIONS).toContain(frontmatter.section)

      // Optional but typed fields
      if (frontmatter.order !== undefined) {
        expect(typeof frontmatter.order).toBe('number')
      }

      if (frontmatter.tags !== undefined) {
        expect(Array.isArray(frontmatter.tags)).toBe(true)
        frontmatter.tags.forEach((tag: unknown) => {
          expect(typeof tag).toBe('string')
        })
      }
    })
  })

  describe('Slug Uniqueness', () => {
    it('should have unique slugs within each category', () => {
      const slugsByCategory: Record<string, string[]> = {}

      for (const filePath of mdxFiles) {
        const relative = path.relative(CONTENT_DIR, filePath)
        const parts = relative.split(path.sep)
        const category = parts[0]
        const slug = path.basename(filePath, '.mdx')

        if (!slugsByCategory[category]) {
          slugsByCategory[category] = []
        }

        // Check for duplicates
        if (slugsByCategory[category].includes(slug)) {
          throw new Error(`Duplicate slug "${slug}" found in category "${category}"`)
        }

        slugsByCategory[category].push(slug)
      }
    })
  })

  describe('Internal Links Validation', () => {
    // Build a set of valid doc paths
    const validDocPaths = new Set<string>()
    const categoryPaths = new Set<string>()

    beforeAll(() => {
      for (const filePath of getMdxFiles(CONTENT_DIR)) {
        const relative = path.relative(CONTENT_DIR, filePath)
        const parts = relative.split(path.sep)
        const category = parts[0]
        const slug = path.basename(filePath, '.mdx')
        validDocPaths.add(`/docs/${category}/${slug}`)
      }
      // Add category index paths
      VALID_SECTIONS.forEach((section) => {
        categoryPaths.add(`/docs/${section}`)
      })
    })

    it.each(
      getMdxFiles(CONTENT_DIR).map((f) => [path.relative(CONTENT_DIR, f), f])
    )('%s has valid internal doc links', (relativePath, filePath) => {
      const content = fs.readFileSync(filePath as string, 'utf-8')
      const links = extractInternalLinks(content)

      for (const link of links) {
        // Skip anchor-only links and external pages we can't validate at test time
        if (link.startsWith('#')) continue
        if (link.startsWith('/publishers/')) continue // Dynamic routes
        if (link.startsWith('/store')) continue // Dynamic route
        if (link.startsWith('/pricing')) continue // Static page, exists

        // For doc links, validate they exist
        if (link.startsWith('/docs/')) {
          const pathWithoutAnchor = link.split('#')[0]
          const hasAnchor = link.includes('#')
          const isDocPath = validDocPaths.has(pathWithoutAnchor)
          const isCategoryPath = categoryPaths.has(pathWithoutAnchor)
          const isDocsIndex = pathWithoutAnchor === '/docs'

          if (hasAnchor) {
            expect(isDocPath).toBe(true)
            continue
          }

          expect(isDocPath || isCategoryPath || isDocsIndex).toBe(true)
        }
      }
    })
  })

  describe('Content Quality', () => {
    it.each(
      getMdxFiles(CONTENT_DIR).map((f) => [path.relative(CONTENT_DIR, f), f])
    )('%s has non-empty content', (relativePath, filePath) => {
      const content = fs.readFileSync(filePath as string, 'utf-8')
      const { content: mdxContent } = matter(content)

      // Should have meaningful content (at least 50 characters after frontmatter)
      expect(mdxContent.trim().length).toBeGreaterThan(50)
    })

    it.each(
      getMdxFiles(CONTENT_DIR).map((f) => [path.relative(CONTENT_DIR, f), f])
    )('%s has a heading', (relativePath, filePath) => {
      const content = fs.readFileSync(filePath as string, 'utf-8')
      const { content: mdxContent } = matter(content)

      // Should have at least one markdown heading
      const hasHeading = /^#{1,6}\s+.+$/m.test(mdxContent)
      expect(hasHeading).toBe(true)
    })
  })
})
