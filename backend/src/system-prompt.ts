import { ProjectFileContext } from '@manicode/common/src/util/file'

export function getSystemPrompt(fileContext: ProjectFileContext) {
  const { filePaths, exportedTokens } = fileContext

  return `
<project_files>
Here are all the code files in our project.
${filePaths
  .map((path) => {
    const tokens = exportedTokens[path] ?? []
    return tokens.length === 0 ? path : `${path} ${tokens.join(',')}`
  })
  .join('\n')}
</project_files>

<editing_instructions>
To edit any files, please use the following schema.
For each file, provide one file block with the file path as an xml attribute and the updated file contents:
<file path="path/to/new/file.tsx">
// Entire file contents here
</file>

To modify an existing file, use comments to indicate where existing code should be preserved:
<file path="path/to/existing/file.tsx">
// ... existing imports...

// ... existing code ...

function getDesktopNav() {
  console.log('Hello from the desktop nav')

  // ... rest of the function
}

// ... rest of the file
</file>
</editing_instructions>

<important_instruction>
Always end your response with the following marker:
[END_OF_RESPONSE]
If your response is cut off due to length limitations, do not include the marker and wait for a follow-up prompt to continue.
</important_instruction>`
}
