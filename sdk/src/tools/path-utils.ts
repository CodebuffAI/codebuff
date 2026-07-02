/**
 * SDK-side re-export of the canonical project-path containment helpers
 * living in `common/`. The real implementation (lexical + realpath/symlink
 * containment, per-project-root realpath cache, synthetic-root fallback) is
 * in `common/src/util/project-path-containment.ts`. Keeping the SDK names
 * stable here preserves the existing public SDK surface for callers in
 * this package (`apply-patch`, `change-file`, `git-status`, `glob`,
 * `list-directory`, `read-files`, `read-image`, `replace-range`, and
 * `run.ts`).
 */
export {
  resolveProjectPath as resolveFilePathWithinProject,
  getProjectPathLookupKeys,
  isPathInsideProject,
  type ContainedProjectPath as ResolvedProjectPath,
} from '@codebuff/common/util/project-path-containment'
