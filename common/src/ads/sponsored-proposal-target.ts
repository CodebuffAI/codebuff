/**
 * What a sponsored proposal is ABOUT, on a surface that has no Cloud project
 * (COD-376, Decision 1).
 *
 * A proposal is an offer to do work in one repository. On Freebuff Web that
 * repository is reachable as a Cloud `project` row, and the project id has
 * always been the key. Desktop opens a local folder and the CLI runs against
 * `process.cwd()`; neither has a project, so off Cloud the key is
 * `(user, repo_full_name)` read from the `origin` remote — which also means
 * the same repository sees the same proposal wherever it is opened.
 *
 * A folder with no GitHub remote gets no proposal, and that is the design
 * rather than a gap: without a stable name there is nothing to key an offer,
 * a decline, or a frequency cap to, and a per-path key would offer the same
 * proposal again for every clone.
 *
 * Lives in `common` because all three surfaces have to derive the SAME string
 * from the same remote. Two normalizers that disagree on a trailing `.git`
 * would silently split one repository into two targets — the user declines on
 * Desktop and is offered it again in the terminal, with nothing to say why.
 */

/**
 * `owner/name`, both segments GitHub-legal.
 *
 * Deliberately narrower than "anything with a slash in it": this string
 * becomes an index key and travels in a query parameter, and a permissive
 * shape is how a path or a URL ends up stored as a repo name.
 */
const REPO_FULL_NAME = /^[A-Za-z0-9._-]{1,100}\/[A-Za-z0-9._-]{1,100}$/

/**
 * The repository name for a git remote URL, or null.
 *
 * Handles the three forms a real `origin` takes — https, ssh, and the scp-like
 * `git@host:owner/name` — and refuses everything else rather than guessing.
 * Null is the ordinary answer for a folder that is not a GitHub clone, so it
 * must not be an exception: the caller's response is to offer no proposal.
 *
 * NOT restricted to github.com. A self-hosted or enterprise remote still
 * yields a stable `owner/name`, and the key's job is stability rather than
 * provenance; the decision path is what decides whether a repository is one we
 * have anything to offer for.
 */
export function repoFullNameFromRemote(
  remoteUrl: string | null | undefined,
): string | null {
  if (!remoteUrl) return null
  const trimmed = remoteUrl.trim()
  if (trimmed.length === 0) return null

  // A REMOTE, not a path. `/home/user/code/thing` is a legal git remote and is
  // not a hosted repository, and stripping a "host" off it yields a
  // plausible-looking `code/thing` that would key a proposal to whatever the
  // last two directories happen to be called. So a host is required: either a
  // scheme, or the scp-like `user@host:owner/name`.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const isScpLike = /^[^/]+@[^/:]+:/.test(trimmed)
  if (!hasScheme && !isScpLike) return null

  // Strip the scheme and credentials, then the host, leaving the path. The
  // scp-like form has no scheme and separates the path with `:` instead.
  const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '')
  if (withoutScheme.includes('://')) return null

  // A SCHEME IS NOT A HOST. `file:///home/user/code/thing` passes the scheme
  // test above and then leaves an absolute PATH behind, which the host-strip
  // below cannot bite on -- it needs a leading non-slash segment. The path
  // survived intact and its last two directories became the key, which is the
  // exact failure the `hasScheme` gate was written to prevent, reached by the
  // one scheme that has no authority component. Anything whose remainder
  // starts with `/` has no host, so it is not a hosted repository.
  if (withoutScheme.startsWith('/')) return null
  const withoutCredentials = withoutScheme.replace(/^[^/@]*@/, '')
  // The same rule as the leading-slash refusal above, for the other way a
  // scheme reaches us with no real authority: `file://./relative/thing` leaves
  // `.` sitting where a host belongs, the strip below happily eats it, and the
  // remaining path's last two segments become the key. A host with no
  // alphanumeric character in it is not a host.
  const host = withoutCredentials.match(/^[^/:]+/)?.[0] ?? ''
  if (!/[A-Za-z0-9]/.test(host)) return null
  const path = withoutCredentials.replace(/^[^/:]+[/:]/, '')

  const cleaned = path.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '')
  // A deeper path (a GitLab subgroup, or a URL with extra segments) keeps its
  // last two components, which is the owner and the repository in every form
  // above. Fewer than two is not a repository name.
  const parts = cleaned.split('/').filter((part) => part.length > 0)
  if (parts.length < 2) return null
  const candidate = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  return normalizeRepoFullName(candidate)
}

/**
 * The canonical form of a repository name, or null if it is not one.
 *
 * LOWERCASED, because GitHub treats owner and repository names
 * case-insensitively and a user who types `Owner/Repo` in one surface and
 * clones `owner/repo` in another must not end up with two targets. The cost is
 * that the stored key does not preserve the display casing — nothing renders
 * this string, so that costs nothing.
 */
export function normalizeRepoFullName(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null
  // Slashes first, THEN the suffix: a trailing slash after `.git` otherwise
  // hides it, and `owner/name.git` is a different index key from `owner/name`.
  const cleaned = raw
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
  if (!REPO_FULL_NAME.test(cleaned)) return null
  // `.` IS IN THE CHARACTER CLASS, so `..` is a legal segment as far as the
  // shape test is concerned and `../..` matches it whole. That string then
  // becomes an index key and travels in a query parameter as a repository
  // name -- a traversal wearing the shape the gate was supposed to enforce.
  // No real owner or repository is only dots, so refusing them costs nothing.
  if (cleaned.split('/').some((segment) => /^\.+$/.test(segment))) return null
  return cleaned.toLowerCase()
}
