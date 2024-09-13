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

/**
 * Generates a patch file based on the differences between the old and new file contents.
 *
 * This function analyzes the modifications made to a file by comparing its original content (`oldContent`)
 * with the updated content (`newContent`). It leverages the user's message history and the full AI response
 * to ensure that the generated patch accurately reflects the intended changes in a context-aware manner.
 *
 * @param userId - The unique identifier of the user initiating the patch generation.
 * @param oldContent - The original content of the file before any changes.
 * @param newContent - The updated content of the file after modifications.
 * @param filePath - The specific file path where the patch will be applied.
 * @param messageHistory - An array of previous messages exchanged, providing context for the changes.
 * @param fullResponse - The complete response from the AI, which may include explanations or additional instructions relevant to the patch.
 * @returns A string representing the generated patch that can be applied to the original file.
 */
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
