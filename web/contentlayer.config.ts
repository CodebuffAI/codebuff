import { defineDocumentType, makeSource } from 'contentlayer/source-files'

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
  },
}))

export default makeSource({
  contentDirPath: 'src/content',
  documentTypes: [Doc],
  disableImportAliasWarning: true,
})
