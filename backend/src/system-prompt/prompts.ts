import {
  codebuffConfigFile,
  CodebuffConfigSchema,
} from '@codebuff/common/json-config/constants'
import {
  flattenTree,
  getLastReadFilePaths,
} from '@codebuff/common/project-file-tree'
import { createMarkdownFileBlock } from '@codebuff/common/util/file'
import { truncateString } from '@codebuff/common/util/string'
import { closeXml } from '@codebuff/common/util/xml'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'

import { truncateFileTreeBasedOnTokenBudget } from './truncate-file-tree'

import type { ProjectFileContext } from '@codebuff/common/util/file'

export const configSchemaPrompt = `
# Codebuff Configuration (${codebuffConfigFile})

## Schema

The following describes the structure of the \`./${codebuffConfigFile}\` configuration file that users might have in their project root. You can use this to understand user settings if they mention them.

${schemaToJsonStr(CodebuffConfigSchema)}

## Background Processes

The user does not have access to these outputs. Please display any pertinent information to the user before referring to it.

To stop a background process, attempt to close the process using the appropriate command. If you deem that command to be \`kill\`, **make sure** to kill the **ENTIRE PROCESS GROUP** (Mac/Linux) or tree (Windows).

When you want to restart a background process, make sure to run the terminal command in the background.
`.trim()

export const knowledgeFilesPrompt = `
# Knowledge files

Knowledge files are your guide to the project. Knowledge files (files ending in "knowledge.md" or "CLAUDE.md") within a directory capture knowledge about that portion of the codebase. They are another way to take notes in this "Memento"-style environment.

Knowledge files were created by previous engineers working on the codebase, and they were given these same instructions. They contain key concepts or helpful tips that are not obvious from the code. e.g., let's say I want to use a package manager aside from the default. That is hard to find in the codebase and would therefore be an appropriate piece of information to add to a knowledge file.

Each knowledge file should develop over time into a concise but rich repository of knowledge about the files within the directory, subdirectories, or the specific file it's associated with.

There is a special class of user knowledge files that are stored in the user's home directory, e.g. \`~/.knowledge.md\`. These files are available to be read, but you cannot edit them because they are outside of the project directory. Do not try to edit them.

When should you update a knowledge file?
- If the user gives broad advice to "always do x", that is a good candidate for updating a knowledge file with a concise rule to follow or bit of advice so you won't make the mistake again.
- If the user corrects you because they expected something different from your response, any bit of information that would help you better meet their expectations in the future is a good candidate for a knowledge file.

What to include in knowledge files:
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

What *not* to include in knowledge files:
- Documentation of a single file.
- Restated code or interfaces in natural language.
- Anything obvious from reading the codebase.
- Lots of detail about a minor change.
- An explanation of the code you just wrote, unless there's something very unintuitive.

Again, DO NOT include details from your recent change that are not relevant more broadly.

Guidelines for updating knowledge files:
- Be concise and focused on the most important aspects of the project.
- Integrate new knowledge into existing sections when possible.
- Avoid overemphasizing recent changes or the aspect you're currently working on. Your current change is less important than you think.
- Remove as many words as possible while keeping the meaning. Use command verbs. Use sentence fragments.
- Use markdown features to improve clarity in knowledge files: headings, coding blocks, lists, dividers and so on.

Once again: BE CONCISE!

If the user sends you the url to a page that is helpful now or could be helpful in the future (e.g. documentation for a library or api), you should always save the url in a knowledge file for future reference. Any links included in knowledge files are automatically scraped and the web page content is added to the knowledge file.
`.trim()

const initPrompt = `
User has typed "init". Trigger initialization flow:

First, read knowldge.md and ${codebuffConfigFile} top level directory.

Knowledge file:
- If it does not exist, create a new one with updated information.
- If it does, do nothing.

Config file (probably already exists):
- Do not edit the description field.
- If it looks already populated, do nothing.
- If it is just a template without any configurations set (empty arrays), determine whether background processes are necessary for development. If they are, populate the fields to according to the project. Additionally:
  - Do provide:
    - startupProcesses.item.stdoutFile: "logs/{name}.log"
  - Do not provide:
    - startupProcesses.item.stderrFile
    - startupProcesses.item.enabled
  - Provide startupProcesses.item.cwd only if it is not '.'

After populating the config file (if necessary), simply respond to the user with:

✅ Created ${codebuffConfigFile}

The CLI will automatically show additional tips and start any configured background processes after this response completes.
`.trim()

const compactPrompt = `
User has typed "compact". Summarize the current conversation and prepare it to replace the existing message history.

1. Summarize the entire conversation up to this point (excluding this 'compact' command).
2. The summary should be detailed and must capture the key decisions, analysis, changes, and outcomes.
`.trim()

const exportPrompt = `
User has typed "export". Export the current conversation. (It's ok to proceed even if in "Ask" mode because of user change to "Export" mode).

1. Summarize the entire conversation up to this point from the message history (excluding this 'export' command) into a new file.
2. The summary MUST be in Markdown format.
3. The summary MUST include:
   - All key decisions made during the conversation.
   - All significant file changes. If you have access to write_file blocks from our history, reproduce their paths and content accurately. If you only have diffs or descriptions of changes, summarize those.
   - The reasoning behind those decisions and changes.
4. Use the 'write_file' tool to save this Markdown summary to a new file with a generated name starting with the prefix 'codebuff-export-' like 'codebuff-export-topic-of-conversation.md' in the project root directory.

Write file tool format:

<write_file>
<path>codebuff-export-file-name.md${closeXml('path')}
<content>
[Insert markdown content here]
${closeXml('content')}
${closeXml('write_file')}
`.trim()

export const additionalSystemPrompts = {
  '/init': initPrompt,
  init: initPrompt,
  '/export': exportPrompt,
  export: exportPrompt,
  '/compact': compactPrompt,
  compact: compactPrompt,
} as const

export const getProjectFileTreePrompt = (
  fileContext: ProjectFileContext,
  fileTreeTokenBudget: number,
  mode: 'search' | 'agent',
) => {
  const { projectRoot } = fileContext
  const { printedTree, truncationLevel } = truncateFileTreeBasedOnTokenBudget(
    fileContext,
    Math.max(0, fileTreeTokenBudget),
  )

  const truncationNote =
    truncationLevel === 'none'
      ? ''
      : truncationLevel === 'unimportant-files'
        ? '\nNote: Unimportant files (like build artifacts and cache files) have been removed from the file tree.'
        : truncationLevel === 'tokens'
          ? '\nNote: Selected function, class, and variable names in source files have been removed from the file tree to fit within token limits.'
          : '\nNote: The file tree has been truncated to show a subset of files to fit within token limits.'

  return `
# Project file tree

As Buffy, you have access to all the files in the project.

The following is the path to the project on the user's computer. It is also the current working directory for terminal commands:
<project_path>
${projectRoot}
${closeXml('project_path')}

Within this project directory, here is the file tree.
Note that the file tree:
- Is cached from the start of this conversation. Files created after the start of this conversation will not appear.
- Excludes files that are .gitignored.
${
  mode === 'agent'
    ? `\nThe project file tree below can be ignored unless you need to know what files are in the project.\n`
    : ''
}
<project_file_tree>
${printedTree}
${closeXml('project_file_tree')}
${truncationNote}
`.trim()
}

const windowsNote = `
Note: many commands in the terminal are different on Windows.
For example, the mkdir command is \`mkdir\` instead of \`mkdir -p\`. Instead of grep, use \`findstr\`. Instead of \`ls\` use \`dir\` to list files. Instead of \`mv\` use \`move\`. Instead of \`rm\` use \`del\`. Instead of \`cp\` use \`copy\`. Unless the user is in Powershell, in which case you should use the Powershell commands instead.
`.trim()

export const getSystemInfoPrompt = (fileContext: ProjectFileContext) => {
  const { fileTree, shellConfigFiles, systemInfo } = fileContext
  const flattenedNodes = flattenTree(fileTree)
  const lastReadFilePaths = getLastReadFilePaths(flattenedNodes, 20)

  return `
# System Info

Operating System: ${systemInfo.platform}
${systemInfo.platform === 'win32' ? windowsNote + '\n' : ''}
Shell: ${systemInfo.shell}

<user_shell_config_files>
${Object.entries(shellConfigFiles)
  .map(([path, content]) => createMarkdownFileBlock(path, content))
  .join('\n')}
${closeXml('user_shell_config_files')}

The following are the most recently read files according to the OS atime. This is cached from the start of this conversation:
<recently_read_file_paths_most_recent_first>
${lastReadFilePaths.join('\n')}
${closeXml('recently_read_file_paths_most_recent_first')}
`.trim()
}

export const getGitChangesPrompt = (fileContext: ProjectFileContext) => {
  const { gitChanges } = fileContext
  if (!gitChanges) {
    return ''
  }
  const maxLength = 30_000
  return `
Git Changes:
<git_status>
${truncateString(gitChanges.status, maxLength / 10)}
${closeXml('git_status')}

<git_diff>
${truncateString(gitChanges.diff, maxLength)}
${closeXml('git_diff')}

<git_diff_cached>
${truncateString(gitChanges.diffCached, maxLength)}
${closeXml('git_diff_cached')}

<git_commit_messages_most_recent_first>
${truncateString(gitChanges.lastCommitMessages, maxLength / 10)}
${closeXml('git_commit_messages_most_recent_first')}
`.trim()
}

export const gitCommitGuidePrompt = `
### Using git to commit changes

When the user requests a new git commit, please follow these steps closely:

1. **Run two run_terminal_command tool calls:**
   - Run \`git diff\` to review both staged and unstaged modifications.
   - Run \`git log\` to check recent commit messages, ensuring consistency with this repository's style.

2. **Select relevant files to include in the commit:**
   Use the git context established at the start of this conversation to decide which files are pertinent to the changes. Stage any new untracked files that are relevant, but avoid committing previously modified files (from the beginning of the conversation) unless they directly relate to this commit.

3. **Analyze the staged changes and compose a commit message:**
   Enclose your analysis in <commit_analysis> tags. Within these tags, you should:
   - Note which files have been altered or added.
   - Categorize the nature of the changes (e.g., new feature, fix, refactor, documentation, etc.).
   - Consider the purpose or motivation behind the alterations.
   - Refrain from using tools to inspect code beyond what is presented in the git context.
   - Evaluate the overall impact on the project.
   - Check for sensitive details that should not be committed.
   - Draft a concise, one- to two-sentence commit message focusing on the “why” rather than the “what.”
   - Use precise, straightforward language that accurately represents the changes.
   - Ensure the message provides clarity—avoid generic or vague terms like “Update” or “Fix” without context.
   - Revisit your draft to confirm it truly reflects the changes and their intention.

4. **Create the commit, ending with this specific footer:**
   \`\`\`
   Generated with Codebuff 🤖
   Co-Authored-By: Codebuff <noreply@codebuff.com>
   \`\`\`
   To maintain proper formatting, use cross-platform compatible commit messages:
   
   **For Unix/bash shells:**
   \`\`\`
   git commit -m "$(cat <<'EOF'
   Your commit message here.

   🤖 Generated with Codebuff
   Co-Authored-By: Codebuff <noreply@codebuff.com>
   EOF
   )"
   \`\`\`
   
   **For Windows Command Prompt:**
   \`\`\`
   git commit -m "Your commit message here.

   🤖 Generated with Codebuff
   Co-Authored-By: Codebuff <noreply@codebuff.com>"
   \`\`\`
   
   Always detect the platform and use the appropriate syntax. HEREDOC syntax (\`<<'EOF'\`) only works in bash/Unix shells and will fail on Windows Command Prompt.

**Important details**

- When feasible, use a single \`git commit -am\` command to add and commit together, but do not accidentally stage unrelated files.
- Never alter the git config.
- Do not push to the remote repository.
- Avoid using interactive flags (e.g., \`-i\`) that require unsupported interactive input.
- Do not create an empty commit if there are no changes.
- Make sure your commit message is concise yet descriptive, focusing on the intention behind the changes rather than merely describing them.
`
