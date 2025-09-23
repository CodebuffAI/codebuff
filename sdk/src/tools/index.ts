// Tool handlers for the Codebuff SDK
import { changeFile } from './change-file'
import { codeSearch } from './code-search'
import { getFiles } from './read-files'
import { runFileChangeHooks } from './run-file-change-hooks'
import { runTerminalCommand } from './run-terminal-command'

// Export tools under Tools namespace
export const ToolHelpers = {
  runTerminalCommand,
  codeSearch,
  getFiles,
  runFileChangeHooks,
  changeFile,
}
