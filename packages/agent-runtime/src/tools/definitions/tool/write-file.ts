import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'write_file'
export const writeFileTool = {
  toolName,
  description: `
Create or replace a file with the given content.

####  Edit Snippet

Format the \`content\` parameter with the entire content of the file or as an edit snippet that describes how you would like to modify the provided existing code.

You may abbreviate any sections of the code in your response that will remain the same with placeholder comments: "// ... existing code ...". Abbreviate as much as possible to save the user credits!

If you don't use any placeholder comments, the entire file will be replaced. E.g. don't write out a single function without using placeholder comments unless you want to replace the entire file with that function.

#### Additional Info

Prefer str_replace to write_file for most edits, including small-to-medium edits to a file, for deletions, or for editing large files (>1000 lines). Otherwise, prefer write_file for major edits throughout a file, or for creating new files.

Do not use this tool to delete or rename a file. Instead run a terminal command for that.

Examples:

Example 1 - Simple file creation:
${getToolCallString(toolName, {
  path: 'new-file.ts',
  instructions: 'Prints Hello, world',
  content: 'console.log("Hello, world!");',
})}

Example 2 - Editing with placeholder comments:
${getToolCallString(toolName, {
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

  doSomethingElse();
}

// ... existing code ...`,
})}

    `.trim(),
} satisfies ToolDescription
