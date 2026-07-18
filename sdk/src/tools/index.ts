// Tool handlers for the Codebuff SDK
import { changeFile, changeFiles } from './change-file'
import { applyPatchTool } from './apply-patch'
import { readImages } from './read-image'
import { edit3dAsset, inspect3dAsset, render3dPreview } from './3d-assets'
import { codeSearch } from './code-search'
import { findFilesMatchingContent } from './find-files-matching-content'
import { glob } from './glob'
import { listDirectory } from './list-directory'
import { getFiles, getFilesStructured } from './read-files'
import { replaceRange } from './replace-range'
import { runFileChangeHooks } from './file-change-hooks'
import { runTerminalCommand } from './run-terminal-command'
import { writeAuditFindings } from './write-audit-findings'

export {
  FilesystemAuthority,
  MAX_COMMIT_RECEIPTS_PER_RUN,
  allowAllFilesystemPolicy,
  composeFilesystemPolicies,
  detectFilesystemCapabilities,
  expectedStateMatches,
  hashFileContent,
} from './filesystem-authority'
export type {
  AuthorizedFilesystemPath,
  CommitLease,
  CommitLeaseState,
  CommitReceipt,
  ExpectedFileState,
  ExpectedStateValidation,
  FileSnapshot,
  FilesystemAuthorityPolicy,
  FilesystemCapability,
  FilesystemCapabilitySnapshot,
  FilesystemOperationKind,
  FilesystemPolicyContext,
  FilesystemPolicyDecision,
  PathAuthorizationResult,
  OptionalCapabilityResult,
  RegisteredFilesystemOperation,
} from './filesystem-authority'
export {
  diagnosticParsers,
  parseLanguageDiagnostics,
} from './language-diagnostics'
export type {
  DiagnosticParser,
  DiagnosticParserInput,
  LanguageDiagnostic,
  LanguageDiagnosticPosition,
  LanguageDiagnosticRange,
  LanguageDiagnosticSeverity,
} from './language-diagnostics'

// Export tools under Tools namespace
export const ToolHelpers = {
  runTerminalCommand,
  codeSearch,
  findFilesMatchingContent,
  glob,
  listDirectory,
  getFiles,
  getFilesStructured,
  replaceRange,
  runFileChangeHooks,
  changeFile,
  changeFiles,
  applyPatchTool,
  readImages,
  inspect3dAsset,
  render3dPreview,
  edit3dAsset,
  writeAuditFindings,
}
