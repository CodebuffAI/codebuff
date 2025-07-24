import type { CodebuffToolDef } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'

const toolName = 'write_file'
const endsAgentStep = false
export const writeFileTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      path: z
        .string()
        .min(1, 'Path cannot be empty')
        .describe(`Path to the file relative to the **project root**`),
      instructions: z
        .string()
        .describe('What the change is intended to do in only one sentence.'),
      content: z.string().describe(`Edit snippet to apply to the file.`),
    })
    .describe(`Create or edit a file with the given content.`),
  description: `
#### **IMPORTANT** Edit Snippet

Format the \`content\` parameter as an edit snippet that describes how you would like to modify the provided existing code.

Edit snippets will be parsed by a less intelligent "fast-apply" model, so you MUST follow this format, otherwise the finetuned smaller model will not understand what to change. For example, do not include detailed instructions on how to apply code changes for the fast-apply model.

Abbreviate any sections of the code in your response that will remain the same with placeholder comments: "// ... existing code ...". Be descriptive in the comment. You MUST to use these in order to **MINIMIZE** the number of characters in the \`content\` parameter.

Make sure that you are abbreviating exactly where you believe the existing code will remain the same.
Indicate the location and nature of the modifications (additions and deletions) with comments and ellipses.

Make sure that you preserve the indentation and code structure of exactly how you believe the final code will look like (do not output lines that will not be in the final code after they are merged).

##### **IMPORTANT** Deletion Comments

**CRITICAL FOR DELETIONS** If you plan on deleting a section, you MUST provide a comment giving the relevant context such that the code is understood to be removed. This is REQUIRED for the fast-apply model to understand what to delete.

Examples:

If the initial code is:
\`\`\`Some code
Block 1
Block 2
Block 3
More code
\`\`\`
And if you want to delete code block 2, you MUST include a comment like:
\`\`\`// existing code
Block 1
// Delete Block 2
Block 3
// rest of code
\`\`\`

**YOU MUST ALWAYS INCLUDE DELETION COMMENTS** when removing **anything**: single lines, code blocks, functions, variables, or any other code elements. The fast-apply model cannot understand deletions without these explicit comments.

Merely omitting the code block may or may not work. In order to guarantee the deletion of the code, you must include a deletion comment.

#### Additional Info

Prefer str_replace to write_file for most edits, including small-to-medium edits to a file, for deletions, or for editing large files (>1000 lines). Otherwise, prefer write_file for major edits throughout a file, or for creating new files.

Do not use this tool to delete or rename a file. Instead run a terminal command for that.

Notes for editing a file:
- If you don't use any placeholder comments, the entire file will be replaced. E.g. don't write out a single function without using placeholder comments unless you want to replace the entire file with that function.
- When editing a file, try not to change any user code that doesn't need to be changed. In particular, you must preserve pre-existing user comments exactly as they are.
- You can also use this tool to create new files.
- After you have written out a write_file block, the changes will be applied immediately. You can assume that the changes went through as intended. However, note that there are sometimes mistakes in the processs of applying the edits you described in the write_file block, e.g. sometimes large portions of the file are deleted. If you notice that the changes did not go through as intended, based on further updates to the file, you can write out a new write_file block to fix the mistake.

Examples:
${getToolCallString(
  toolName,
  {
    path: 'path/to/file',
    instructions: 'How the file is being updated',
    content: 'Your file content here',
  },
  endsAgentStep
)}

Example 1 - Simple file creation:
${getToolCallString(
  toolName,
  {
    path: 'new-file.ts',
    instructions: 'Prints Hello, world',
    content: 'console.log("Hello, world!");',
  },
  endsAgentStep
)}

Example 2 - Editing with placeholder comments:
${getToolCallString(
  toolName,
  {
    path: 'foo.ts',
    instructions: 'Update foo and remove console.log',
    content: `// ... existing code ...

function foo() {
  console.log('foo');
  for (let i = 0; i < 10; i++) {
    console.log(i);
  }
  doSomething();

  // Delete the console.log line from here
}

// ... existing code ...`,
  },
  endsAgentStep
)}

    `.trim(),
} satisfies CodebuffToolDef
