import { Message } from 'common/actions'
import { promptOpenAI } from './openai-api'

export async function generatePatch(
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
) {
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const normalizedNewContent = normalizeLineEndings(newContent)

  const patch = await generatePatchPrompt(
    userId,
    normalizedOldContent,
    normalizedNewContent,
    filePath,
    messageHistory,
    fullResponse
  )
  console.log('got patch', newContent, '\n\n', patch)
  const updatedPatch = patch.replaceAll('\n', lineEnding)
  return updatedPatch
}

const generatePatchPrompt = async (
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
) => {
  const oldFileWithLineNumbers = oldContent
    .split('\n')
    .map((line, index) => `${index + 1}|${line}`)
    .join('\n')
  const prompt = `
Here's an old file for ${filePath}:

\`\`\`
${oldFileWithLineNumbers}
\`\`\`

And here's a sketch of the changes:

\`\`\`
${newContent}
\`\`\`

Please produce a patch file based on this change. Respond with the patch file only.

For example:

Sketch of the changes:

\`\`\`
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import models from "./models";
import { ArticleNodeDataType } from "@/lib/types";

// ... (keep all existing code up to the souvenirValidationSchema)

// Base Souvenir Validation Schema
const baseSouvenirValidationSchema = {
  article_id: z.number().int().positive(),
  type: ArticleNodeDataType,
  created_at: z.date().optional(),
};

// Discriminated union for souvenir data based on type
const souvenirDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(ArticleNodeDataType.Enum.code),
    data: z.object({
      souvenir: z.object({
        steps: z.array(z.string()),
        components: z.array(z.object({
          fn: z.string(),
          name: z.string(),
        })),
        srcs: z.array(z.string()).optional(),
      }),
    }),
  }),
  // Add other types here as needed
]);

const souvenirValidationSchema = {
  ...baseSouvenirValidationSchema,
  ...souvenirDataSchema.shape,
};

const souvenirInsertSchema = createInsertSchema(
  models.souvenirs,
  souvenirValidationSchema
);
const souvenirSelectSchema = createSelectSchema(
  models.souvenirs,
  souvenirValidationSchema
);

// ... (keep the rest of the existing code)
\`\`\`


Patch:
\`\`\`
diff --git a/apps/ebook-web/db/schemas.ts b/apps/ebook-web/db/schemas.ts
index 0b3b1c3b0..b3b8b0b3b 100644
--- a/apps/ebook-web/db/schemas.ts
+++ b/apps/ebook-web/db/schemas.ts
@@ -47,23 +47,37 @@ const articleSelectSchema = createSelectSchema(
   articleValidationSchema
 );

-const souvenirValidationSchema = {
+// Base Souvenir Validation Schema
+const baseSouvenirValidationSchema = {
   article_id: z.number().int().positive(),
   type: ArticleNodeDataType,
-  data: z.object({
+  created_at: z.date().optional(),
+};
+
+// Discriminated union for souvenir data based on type
+const souvenirDataSchema = z.discriminatedUnion("type", [
+  z.object({
+    type: z.literal(ArticleNodeDataType.Enum.code),
+    data: z.object({
     souvenir: z.object({
       steps: z.array(z.string()),
-      components: z.array(
-        z.object({
-          fn: z.string(),
-          name: z.string(),
-        })
-      ),
+      components: z.array(z.object({
+        fn: z.string(),
+        name: z.string(),
+      })),
       srcs: z.array(z.string()).optional(),
     }),
   }),
+  // Add other types here as needed
+]);
+
+const souvenirValidationSchema = {
+  ...baseSouvenirValidationSchema,
+  ...souvenirDataSchema.shape,
 };
+
 const souvenirInsertSchema = createInsertSchema(
   models.souvenirs,
   souvenirValidationSchema
\`\`\`

`.trim()

  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]
  return await promptOpenAI(
    userId,
    messages,
    'o1-mini'
    // 'ft:gpt-4o-2024-08-06:manifold-markets:run-1:A4VfZwvz'
  )
}
