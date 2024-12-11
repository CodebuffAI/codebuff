import { defineDocumentType, makeSource } from 'contentlayer/source-files'
import * as fs from 'fs'
import * as path from 'path'

export const Doc = defineDocumentType(() => ({
  name: 'Doc',
  filePathPattern: `**/*.mdx`,
  contentType: 'mdx',
  fields: {
    title: { type: 'string', required: true },
    section: { type: 'string', required: true },
    tags: { type: 'list', of: { type: 'string' }, required: false },
    order: { type: 'number', required: false },
  },
  computedFields: {
    slug: {
      type: 'string',
      resolve: (doc) => doc._raw.sourceFileName.replace(/\.mdx$/, ''),
    },
    category: {
      type: 'string',
      resolve: (doc) => doc._raw.sourceFileDir,
    },
    ctaContent: {
      type: 'mdx',
      resolve: async (doc) => {
        const ctaPath = path.join(
          process.cwd(),
          'src/content',
          doc._raw.sourceFileDir,
          '_cta.mdx'
        )
        if (!fs.existsSync(ctaPath)) {
          return undefined
        }
        // Use the same processing as the main content
        const content = fs.readFileSync(ctaPath, 'utf8')
        return {
          raw: content,
          code: content, // Contentlayer will process this into MDX
        }
      },
    },
  },
}))

export default makeSource({
  contentDirPath: 'src/content',
  documentTypes: [Doc],
  disableImportAliasWarning: true,
})
