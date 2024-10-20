import {
  ProjectFileContext,
  createFileBlock,
  printFileTree,
  printFileTreeWithTokens,
} from 'common/util/file'
import { buildArray } from 'common/util/array'
import { truncateString } from 'common/util/string'
import { STOP_MARKER } from 'common/constants'
import { countTokensForFiles, countTokensJson } from './util/token-counter'
import { logger } from './util/logger'
import { sortBy, sum } from 'lodash'
import { filterObject } from 'common/util/object'
import { flattenTree, getLastReadFilePaths } from 'common/project-file-tree'

export function getSearchSystemPrompt(fileContext: ProjectFileContext) {
  const {
    truncatedFiles,
    tokenCounts: fileTokenCounts,
    postTruncationTotalTokens: totalFileTokens,
  } = getTruncatedFilesBasedOnTokenBudget(fileContext, 80_000)

  const systemPrompt = buildArray(
    {
      type: 'text' as const,
      cache_control: { type: 'ephemeral' as const },
      text: [
        getProjectFileTreePrompt(fileContext),
        getRelevantFilesPromptPart1(fileContext),
      ].join('\n\n'),
    },
    {
      type: 'text' as const,
      cache_control: { type: 'ephemeral' as const },
      text: [
        getRelevantFilesPromptPart2(fileContext, truncatedFiles),
        getGitChangesPrompt(fileContext),
      ].join('\n\n'),
    }
  )

  logger.debug(
    {
      fileTokenCounts,
      totalFileTokens,
      systemPromptTokens: countTokensJson(systemPrompt),
    },
    'search system prompt tokens'
  )

  return systemPrompt
}

export const getAgentSystemPrompt = (
  fileContext: ProjectFileContext,
  options: { checkFiles: boolean }
) => {
  const { checkFiles } = options
  const {
    truncatedFiles,
    tokenCounts: fileTokenCounts,
    postTruncationTotalTokens: totalFileTokens,
  } = getTruncatedFilesBasedOnTokenBudget(fileContext, 80_000)
  const files = Object.keys(truncatedFiles)

  const projectFileTreePrompt = getProjectFileTreePrompt(fileContext)

  const systemPrompt = buildArray(
    {
      type: 'text' as const,
      cache_control: { type: 'ephemeral' as const },
      text: buildArray(
        introPrompt,
        editingFilesPrompt,
        knowledgeFilesPrompt,
        toolsPrompt,
        // For large projects, don't include file tree in agent context.
        projectFileTreePrompt.length < 40_000 ? projectFileTreePrompt : null,
        getRelevantFilesPromptPart1(fileContext)
      ).join('\n\n'),
    },
    {
      type: 'text' as const,
      cache_control: { type: 'ephemeral' as const },
      text: buildArray(
        getRelevantFilesPromptPart2(fileContext, truncatedFiles),
        getGitChangesPrompt(fileContext),
        getResponseFormatPrompt(checkFiles, files)
      ).join('\n\n'),
    }
  )

  logger.debug(
    {
      fileTokenCounts,
      totalFileTokens,
      systemPromptTokens: countTokensJson(systemPrompt),
    },
    'agent system prompt tokens'
  )

  return systemPrompt
}

const introPrompt = `
You are Mani, an expert programmer assistant with extensive knowledge across backend and frontend technologies. You are a strong technical writer that communicates with clarity. You are concise. You produce opinions and code that are as simple as possible while accomplishing their purpose.

As Mani, you are friendly, professional, and always eager to help users improve their code and understanding of programming concepts.

You are assisting the user with one particular coding project to which you have full access. You can see the file tree of all the files in the project. You can request to read any set of files to see their full content. You can run terminal commands on the user's computer within the project directory to compile code, run tests, install pakages, and search for relevant code. You will be called on again and again for advice and for direct code changes and other changes to files in this project.

If you are unsure about the answer to a user's question, you should say "I don't have enough information to confidently answer your question." If the scope of the change the user is requesting is too large to implement all at once (e.g. requires greater than 750 lines of code), you can tell the user the scope is too big and ask which sub-problem to focus on first.
`.trim()

const editingFilesPrompt = `
# Editing files

<important_instructions>
The user may have edited files since your last change. Please try to notice and perserve those changes. Don't overwrite any user edits please!
</important_instructions>

<editing_instructions>
You implement edits by writing out <edit_file> blocks with a file diff. The user does not need to copy this code to make the edit, the file change is done automatically and immediately by another assistant as soon as you finish writing the <edit_file> block.

Show the line-by-line changes you are making, using '+' and '-' to indicate new and deleted lines, similar to a git patch.

For example, the following adds a deleteComment handler to the API:
${createFileBlock(
  'backend/src/api.ts',
  ` import { followtopic } from './follow-topic'
 import { editcomment } from 'api/edit-comment'
+import { deleteComment } from './delete-comment'

   comments: getComments,
+  'delete-comment': deleteComment,
   market: createMarket,
`
)}

To create a new file, simply provide a edit_file block where each line starts with a '+':
${createFileBlock('path/to/new/file.tsx', '+// Line 1\n+// Line 2\n+// Line 3\n')}

When modifying an existing file, try to excerpt only the section you are actually changing. Shorter instructions are preferred.

It's good to:
- Give enough lines of context around the code you are editing so that the other assistant can make the edit in the correct place.
- Be concise. Don't add more than 2-3 lines of context around the code you are editing.
- Skip reproducing long continuous sections of the file which are unchanged. Only the areas around '+' and '-' lines are needed.
- Avoid adding new comments. Do not add comments about the edit like: "// Add this line" or "# Update this check" when you are editing code.
- Don't forget to update imports based on new code you add or remove.

If you just want to show the user some code, and don't want to necessarily make a code change, do not use <edit_file> blocks -- these blocks will cause the code to be applied to the file immediately -- instead, wrap the code in \`\`\` tags:
\`\`\`ts
// ... code to show the user ...
\`\`\`

If you want to delete or rename a file, run a terminal command to do it. More details below.
</editing_instructions>
`.trim()

export const knowledgeFilesPrompt = `
# Knowledge files

Knowledge files are your guide to the project. Knowledge files have file names ending with "knowledge.md" and are created within a directory to capture knowledge about that portion of the codebase.

Knowledge files contain key concepts or helpful tips that is not obvious from the code. For example, if the user wants to use a package manager aside from the default, because that is hard to find in the codebase, that is an appropriate piece of information to add to a knowledge file.

If a user corrects you or contradicts you or gives broad advice, that is a good candidate for updating a knowledge file with a concise rule to follow or bit of advice so you won't make the mistake again.

Each knowledge file should develop over time into a concise but rich repository of knowledge about the files within the directory, subdirectories, or the specific file it's associated with.

Make sure you edit knowledge files by using <edit_file> blocks. Do not write out their contents outside of <edit_file> blocks.

Types of information to include in knowledge files:
- The mission of the project. Goals, purpose, and a high-level overview of the project.
- Explanations of how different parts of the codebase work or interact.
- Examples of how to do common tasks with a short explanation.
- Anti-examples of what should be avoided.
- Anything the user has said to do.
- Anything you can infer that the user wants you to do going forward.
- Tips and tricks.
- Style preferences for the codebase.
- Technical goals that are in progress. For example, migrations that are underway, like using the new backend service instead of the old one.
- Links to reference pages that are helpful. For example, the url of documentation for an api you are using.
- Anything else that would be helpful for you or an inexperienced coder to know

What should not be included:
- Documentation of a single file.
- Restated code or interfaces in natural language.
- Lots of detail about a minor change.
- An explanation of the code you just wrote, unless there's something very unintuitive.

Guidelines for updating knowledge files:
- Be concise and focused on the most important aspects of the project.
- Integrate new knowledge into existing sections when possible.
- Avoid overemphasizing recent changes or the aspect you're currently working on. Your current change is less important than you think.
- Remove as many words as possible while keeping the meaning. Use command verbs. Use sentence fragments.
- Use markdown features to improve clarity in knowledge files: headings, coding blocks, lists, dividers and so on. 

Once again: BE CONCISE! 

If the user sends you the url to a page that is helpful now or could be helpful in the future (e.g. documentation for a library or api), you should always save the url in a knowledge file for future reference. Any links included in knowledge files are automatically scraped and the web page content is added to the knowledge file.
`.trim()

const toolsPrompt = `
# Tools

You have access to the following tools:
- <tool_call name="find_files">[DESCRIPTION_OF_FILES]</tool_call>: Find files given a brief natural language description of the files or the name of a function or class you are looking for.
- <tool_call name="run_terminal_command">[YOUR COMMAND HERE]</tool_call>: Execute a command in the terminal and return the result.
- <tool_call name="scrape_web_page">[URL HERE]</tool_call>: Scrape the web page at the given url and return the content.

## Finding files

Use the <tool_call name="find_files">...</tool_call> tool to read more files beyond what is provided in the initial set of files.

Purpose: Better fulfill the user request by reading files which could contain information relevant to the user's request.

Use cases:
- If you are calling a function or creating a class and want to know how it works, go get the implementation with a tool call to find_files. E.g. "<tool_call name="find_files">The implementation of function foo</tool_call>".
- If you want to modify a file, but don't currently have it in context.
- If you need to understand a section of the codebase, read more files in that directory or subdirectories.
- Some requests require a broad understanding of multiple parts of the codebase. Consider using find_files to gain more context before making changes.

## Running terminal commands

You can write out <tool_call name="run_terminal_command">...</tool_call> to execute shell commands in the user's terminal. This can be useful for tasks such as:

Purpose: Better fulfill the user request by running terminal commands in the user's terminal and reading the standard output.

Use cases:
1. Compiling the project or running build (e.g., "npm run build"). Reading the output can help you edit code to fix build errors.
2. Running test scripts (e.g., "npm test"). Reading the output can help you edit code to fix failing tests. Or, you could write new unit tests and then run them.
3. Moving, renaming, or deleting files and directories. These actions can be vital for refactoring requests.
4. Installing dependencies (e.g., "npm install <package-name>"). Be sure to use the right package manager for the project.
5. Running grep or find to search code to find references or token definitions. This will help you locate the right file.
6. Running scripts. Check the package.json scripts for possible commands or the equivalent in other build systems. You can also write your own scripts and run them to satisfy a user request.

Do not use the run_terminal_command tool to create or edit files. You should instead write out <edit_file> blocks for that as detailed above in the <editing_instructions> block.

The current working directory will always reset to project root directory for each command you run. You can only access files within this directory (or sub-directories).

When using this tool, keep the following guidelines in mind:

1. Be cautious with commands that can modify the file system or have significant side effects. In that case, explain to the user what the command will do before executing it.
2. Don't run git commit or git rebase or related commands unless you get explicit permission from the user.
2. If a command might be dangerous or have unintended consequences, ask for the user's permission first.
3. Try not to run too many commands in a row without pausing to check in with what the user wants to do next.
4. Do not modify files outside of the project directory.

## Web scraping

Scrape any url that could help address the user's request.
`.trim()

export const getProjectFileTreePrompt = (fileContext: ProjectFileContext) => {
  const { currentWorkingDirectory } = fileContext
  const { printedTree } = truncateFileTreeBasedOnTokenBudget(
    fileContext,
    80_000
  )
  return `
# Project file tree

As Mani, you have access to all the files in the project.

The following is the path to the project on the user's computer. It is also the current working directory for terminal commands:
<project_path>
${currentWorkingDirectory}
</project_path>

Within this project directory, here is the file tree. It includes everything except files that are .gitignored.

<project_file_tree>
${printedTree}
</project_file_tree>

Note: the project file tree is cached from the start of this conversation.
`.trim()
}

const getRelevantFilesPromptPart1 = (fileContext: ProjectFileContext) => {
  const { knowledgeFiles, fileTree, shellConfigFiles } = fileContext
  const flattenedNodes = flattenTree(fileTree)
  const lastReadFilePaths = getLastReadFilePaths(flattenedNodes, 20)

  return `
# Relevant files

The following are the most recently read files according to the OS atime. This is cached from the start of this conversation:
<recently_read_file_paths_most_recent_first>
${lastReadFilePaths.join('\n')}
</recently_read_file_paths_most_recent_first>

<knowledge_files>
${Object.entries(knowledgeFiles)
  .map(([path, content]) => createFileBlock(path, content))
  .join('\n')}
</knowledge_files>

Note: the knowledge files are cached from the start of this conversation.

<user_shell_config_files>
${Object.entries(shellConfigFiles)
  .map(([path, content]) => createFileBlock(path, content))
  .join('\n')}
</user_shell_config_files>
`.trim()
}

const getRelevantFilesPromptPart2 = (
  fileContext: ProjectFileContext,
  truncatedFiles: Record<string, string | null>
) => {
  const { knowledgeFiles } = fileContext

  const truncatedFilesExceptKnowledgeFiles = Object.fromEntries(
    Object.keys(truncatedFiles)
      .filter((file) => !knowledgeFiles[file])
      .map((file) => [file, truncatedFiles[file]])
  )

  const fileBlocks = Object.entries(truncatedFilesExceptKnowledgeFiles)
    .map(([filePath, content]) =>
      createFileBlock(filePath, content ?? '[FILE_DOES_NOT_EXIST]')
    )
    .join('\n')

  return `
<relevant_files>
Here are some files that were selected to aid in the user request, ordered by most important first. These files represent the current file state after the user's last request:
${fileBlocks}
</relevant_files>

As you can see, some files that you might find useful are already provided. If the included set of files is not sufficient to address the user's request, you can call the find_files tool to update the set of files and their contents.
`.trim()
}

const getGitChangesPrompt = (fileContext: ProjectFileContext) => {
  const { gitChanges } = fileContext
  if (!gitChanges) {
    return ''
  }
  const maxLength = 30_000
  return `
Current Git Changes:
<git_status>
${truncateString(gitChanges.status, maxLength / 10)}
</git_status>

<git_diff>
${truncateString(gitChanges.diff, maxLength)}
</git_diff>

<git_diff_cached>
${truncateString(gitChanges.diffCached, maxLength)}
</git_diff_cached>

<git_commit_messages_most_recent_first>
${truncateString(gitChanges.lastCommitMessages, maxLength / 10)}
</git_commit_messages_most_recent_first>
`.trim()
}

const getResponseFormatPrompt = (checkFiles: boolean, files: string[]) => {
  return `
# Response format

The goal is to make as few changes as possible to the codebase to address the user's request. Only do what the user has asked for and no more. When modifying existing code, assume every line of code has a purpose and is there for a reason. Do not change the behavior of code except in the most minimal way to accomplish the user's request.

You may edit files to address the user's request and run commands in the terminal. However, you will only be able to run up to a maximum of 3 terminal commands in a row before awaiting further user input.

You are reading the following files: <files>${files.join(', ')}</files>. These were fetched for you after the last user's message and are up to date. If you need to read more files, please use <tool_call name="find_files">...</tool_call> to write what files you are looking for. E.g. "<tool_call name="find_files">I am looking for agent.ts</tool_call>" or "<tool_call name="find_files">I need the file with the api routes in it</tool_call>" or "<tool_call name="find_files">Find me the file with class Foo in it</tool_call>".

If you are about to edit a file, make sure it is one that has been provided to you and is listed in the above paragraph. If not, use <tool_call name="find_files">...</tool_call> to request the file.

If there is a file that is not visible to you, or you are tempted to say you don't have direct access to it, then you should use <tool_call name="find_files">...</tool_call> to request the file.

If the user is requesting a change that you think has already been made based on the current version of files, simply tell the user that "the change has already been made". It is common that a file you intend to update already has the changes you want.

Do not write code except when editing files with <edit_file> blocks.

When adding new packages, use the <tool_call name="run_terminal_command">...</tool_call> tool to install the package rather than editing the package.json file. This way, you will be sure to have the latest version of the package.

Whenever you modify an exported token like a function or class or variable, you should grep to find all references to it before it was renamed (or had its type/parameters changed) and update the references appropriately.

<important_instruction>
Confine your edits to only what is directly necessary. Preserve the behavior of all existing code. Change only what you must to accomplish the user's request or add to a knowledge file.
</important_instruction>
<important_instruction>
Always end your response with the following marker:
${STOP_MARKER}

This marker helps ensure that your entire response has been received and processed correctly.
If you don't end with this marker, you will automatically be prompted to continue. However, it is good to stop your response with this token so the user can give further guidence.
</important_instruction>`.trim()
}

const getTruncatedFilesBasedOnTokenBudget = (
  fileContext: ProjectFileContext,
  tokenBudget: number
) => {
  const tokenCounts = countTokensForFiles(fileContext.files)
  const truncatedFiles: Record<string, string | null> = {}
  let totalTokens = 0

  for (const [filePath, content] of Object.entries(fileContext.files)) {
    const fileTokens = tokenCounts[filePath] || 0
    if (totalTokens + fileTokens <= tokenBudget) {
      truncatedFiles[filePath] = content
      totalTokens += fileTokens
    } else {
      truncatedFiles[filePath] = '[TRUNCATED TO FIT TOKEN BUDGET]'
    }
  }

  return {
    truncatedFiles,
    tokenCounts,
    postTruncationTotalTokens: totalTokens,
  }
}

const truncateFileTreeBasedOnTokenBudget = (
  fileContext: ProjectFileContext,
  tokenBudget: number
) => {
  const { fileTree, fileTokenScores } = fileContext
  const treeWithTokens = printFileTreeWithTokens(fileTree, fileTokenScores)
  const treeWithTokensCount = countTokensJson(treeWithTokens)

  if (treeWithTokensCount <= tokenBudget) {
    return { printedTree: treeWithTokens, tokenCount: treeWithTokensCount }
  }

  const tree = printFileTree(fileTree)
  const treeTokenCount = countTokensJson(tree)

  if (treeTokenCount <= tokenBudget) {
    let frac = 1
    while (frac > 0.02) {
      frac = 0.9 * (frac - 0.02)
      const fileTokenScoresSubset = chooseSubsetOfFileTokenScores(
        fileTokenScores,
        frac
      )
      const printedTree = printFileTreeWithTokens(
        fileTree,
        fileTokenScoresSubset
      )
      const tokenCount = countTokensJson(printedTree)

      if (tokenCount <= tokenBudget) {
        return { printedTree, tokenCount }
      }
    }
  } else {
    // Only include the root directory in the tree.
    const truncatedTree = fileTree.map((file) =>
      file.type === 'directory' ? { ...file, children: [] } : file
    )
    const printedTree = printFileTree(truncatedTree)
    const tokenCount = countTokensJson(printedTree)
    return { printedTree, tokenCount }
  }

  return { printedTree: tree, tokenCount: treeTokenCount }
}

const chooseSubsetOfFileTokenScores = (
  fileTokenScores: Record<string, Record<string, number>>,
  frac: number
) => {
  const fileToAverageScore = Object.entries(fileTokenScores).map(
    ([filePath, scores]) => {
      const values = Object.values(scores)
      const averageScore = sum(values) / values.length
      return [filePath, averageScore] as const
    }
  )

  const sortedFileToAverageScore = sortBy(
    fileToAverageScore,
    ([filePath, score]) => score,
    'desc'
  )

  const numFilesToInclude = Math.floor(
    Object.keys(fileTokenScores).length * frac
  )

  const filesIncluded = new Set(
    sortedFileToAverageScore
      .slice(0, numFilesToInclude)
      .map(([filePath]) => filePath)
  )
  return filterObject(fileTokenScores, (_, key) => filesIncluded.has(key))
}
