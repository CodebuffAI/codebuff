import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'code_search'
export const codeSearchTool = {
  toolName,
  description: `
Purpose: Search through code files to find files with specific text patterns, function names, variable names, and more.

Prefer to use read_files instead of code_search unless you need to search for a specific pattern in multiple files.

Use cases:
1. Finding all references to a function, class, or variable name across the codebase
2. Searching for specific code patterns or implementations
3. Looking up where certain strings or text appear
4. Finding files that contain specific imports or dependencies
5. Locating configuration settings or environment variables

The pattern supports regular expressions and will search recursively through all files in the project by default. Some tips:
- Be as constraining in the pattern as possible to limit the number of files returned, e.g. if searching for the definition of a function, use "(function foo|const foo)" or "def foo" instead of merely "foo".
- Use word boundaries (\\b) to match whole words only
- Searches file content and filenames
- Automatically ignores binary files, hidden files, and files in .gitignore

Advanced ripgrep flags (use the flags parameter):
- Case sensitivity: "-i" for case-insensitive search
- File type filtering: "-t ts" (TypeScript), "-t js" (JavaScript), "-t py" (Python), etc.
- Exclude file types: "--type-not test" to exclude test files
- Context lines: "-A 3" (3 lines after), "-B 2" (2 lines before), "-C 2" (2 lines before and after)
- Line numbers: "-n" to show line numbers
- Count matches: "-c" to count matches per file
- Only filenames: "-l" to show only filenames with matches
- Invert match: "-v" to show lines that don't match
- Word boundaries: "-w" to match whole words only
- Fixed strings: "-F" to treat pattern as literal string (not regex)

Note: Do not use the end_turn tool after this tool! You will want to see the output of this tool before ending your turn.

Examples:
${getToolCallString(toolName, { pattern: 'foo' })}
${getToolCallString(toolName, { pattern: 'foo\\.bar = 1\\.0' })}
${getToolCallString(toolName, { pattern: 'import.*foo', cwd: 'src' })}
${getToolCallString(toolName, { pattern: 'function.*authenticate', flags: '-i -t ts' })}
${getToolCallString(toolName, { pattern: 'TODO', flags: '-n --type-not test' })}
${getToolCallString(toolName, { pattern: 'getUserData', maxResults: 10 })}
    `.trim(),
} satisfies ToolDescription
