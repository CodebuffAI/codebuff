// contentlayer.config.ts
import { defineDocumentType, makeSource } from "contentlayer/source-files";
var Doc = defineDocumentType(() => ({
  name: "Doc",
  filePathPattern: `**/*.mdx`,
  contentType: "mdx",
  fields: {
    title: { type: "string", required: true },
    section: { type: "string", required: true },
    tags: { type: "list", of: { type: "string" }, required: false },
    order: { type: "number", required: false }
  },
  computedFields: {
    slug: {
      type: "string",
      resolve: (doc) => doc._raw.sourceFileName.replace(/\.mdx$/, "")
    },
    category: {
      type: "string",
      resolve: (doc) => doc._raw.sourceFileDir
    }
  }
}));
var contentlayer_config_default = makeSource({
  contentDirPath: "src/content",
  documentTypes: [Doc],
  disableImportAliasWarning: true
});
export {
  Doc,
  contentlayer_config_default as default
};
//# sourceMappingURL=compiled-contentlayer-config-JDFCJHK7.mjs.map
