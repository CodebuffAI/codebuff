// Tool handlers for the Codebuff SDK
import { changeFile } from './change-file'
import { codeSearch } from './code-search'
import { findFilesMatchingContent } from './find-files-matching-content'
import { glob } from './glob'
import { listDirectory } from './list-directory'
import { getFiles } from './read-files'
import { replaceRange } from './replace-range'
import { runFileChangeHooks } from './run-file-change-hooks'
import { runTerminalCommand } from './run-terminal-command'

// Export tools under Tools namespace
export const ToolHelpers = {
  runTerminalCommand,
  codeSearch,
  findFilesMatchingContent,
  glob,
  listDirectory,
  getFiles,
  replaceRange,
  runFileChangeHooks,
  changeFile,
}
