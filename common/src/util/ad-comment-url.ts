import {
  AD_PLATFORM_HOSTS,
  type AdPlatform,
} from '../constants/freebuff-ads'

/**
 * Deterministic validation of a link to the comment somebody left.
 *
 * ## Why this exists at all
 *
 * A screenshot is weak evidence that is expensive to fake; a permalink is
 * strong evidence that is cheap to fake. Neither alone is proof, and this file
 * is not trying to produce proof — it is trying to make the honest path
 * *trivial* while leaving a durable, auditable record that a later sweep can
 * check against the real platform.
 *
 * What it buys, concretely: on Reddit and LinkedIn the post identifier appears
 * inside a comment permalink, so a link either belongs to the promoted post or
 * it does not, and that is a string comparison rather than a model call. On X
 * a reply's URL carries no reference to its parent, so the strongest available
 * check is "this is a status URL, and it is not just the post you were asked
 * to engage with" — which still catches the single most common lazy
 * submission.
 *
 * ## What it is NOT
 *
 * It is not a claim that the comment is *theirs*. Nothing in a URL says who
 * wrote it, and pretending otherwise would be worse than admitting it: the
 * attestation checkbox, the flagged-submission queue and the ban threat are
 * what price a forged link. This function's job is to be free, deterministic,
 * and honest about its own strength — which `matchesPost` reports.
 */

export type CommentUrlStrength =
  /** The URL provably references the promoted post. The strongest verdict
   *  available without calling a platform API. */
  | 'post_confirmed'
  /** A well-formed comment/reply URL on the right platform, but the platform's
   *  URL shape carries no reference to the parent post, so we cannot tell. */
  | 'platform_only'

export type CommentUrlCheck =
  | { ok: true; strength: CommentUrlStrength; normalized: string }
  | { ok: false; reason: string }

function parse(raw: string): URL | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url
  } catch {
    return null
  }
}

function hostMatches(url: URL, platform: AdPlatform): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  return AD_PLATFORM_HOSTS[platform].some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  )
}

/** `/r/<sub>/comments/<postId>/<slug>?/<commentId>?` → the two ids. Reddit
 *  permalinks are the one platform where both are in the path, which is what
 *  makes `post_confirmed` reachable there. */
function redditIds(url: URL): { postId?: string; commentId?: string } {
  const parts = url.pathname.split('/').filter(Boolean)
  const at = parts.indexOf('comments')
  if (at < 0) return {}
  return { postId: parts[at + 1], commentId: parts[at + 3] }
}

/** The trailing numeric id of an `/status/<id>` path. */
function tweetId(url: URL): string | undefined {
  const parts = url.pathname.split('/').filter(Boolean)
  const at = parts.indexOf('status')
  if (at < 0) return undefined
  return parts[at + 1]?.split('?')[0]
}

/** LinkedIn activity id, from either the path (`.../activity-<id>-<hash>` or
 *  `urn:li:activity:<id>`) or a `commentUrn` query parameter. */
function linkedinActivityId(url: URL): string | undefined {
  const decoded = decodeURIComponent(
    `${url.pathname}?${url.searchParams.toString()}`,
  )
  return (
    /urn:li:activity:(\d+)/i.exec(decoded)?.[1] ??
    /activity-(\d+)-/i.exec(decoded)?.[1]
  )
}

export function checkCommentUrl(params: {
  platform: AdPlatform
  /** The promoted post's URL, for the same-post comparison. */
  postUrl: string
  commentUrl: string
}): CommentUrlCheck {
  const url = parse(params.commentUrl)
  if (!url) return { ok: false, reason: 'That is not a valid link.' }
  if (!hostMatches(url, params.platform)) {
    return {
      ok: false,
      reason: 'That link is not on the same platform as the post.',
    }
  }
  const post = parse(params.postUrl)
  const normalized = url.toString()

  if (params.platform === 'reddit') {
    const comment = redditIds(url)
    if (!comment.postId) {
      return { ok: false, reason: 'That is not a link to a Reddit comment.' }
    }
    if (!comment.commentId) {
      // The post's own permalink, not a comment's. The most common mistake and
      // the most common lazy submission; they are indistinguishable here, so
      // the message assumes the mistake.
      return {
        ok: false,
        reason:
          'That links to the post, not to your comment. Use the comment’s permalink.',
      }
    }
    const target = post ? redditIds(post).postId : undefined
    if (target && target !== comment.postId) {
      return { ok: false, reason: 'That comment is on a different post.' }
    }
    return { ok: true, strength: 'post_confirmed', normalized }
  }

  if (params.platform === 'twitter') {
    const id = tweetId(url)
    if (!id || !/^\d+$/.test(id)) {
      return { ok: false, reason: 'That is not a link to a post or reply.' }
    }
    const target = post ? tweetId(post) : undefined
    if (target && target === id) {
      return {
        ok: false,
        reason:
          'That links to the post itself. Open your reply and copy its link.',
      }
    }
    // A reply's URL says nothing about its parent, so this is as far as a URL
    // can take us on X. Honest rather than convenient — the caller decides
    // what a weaker verdict is worth.
    return { ok: true, strength: 'platform_only', normalized }
  }

  const activity = linkedinActivityId(url)
  if (!activity) {
    return { ok: false, reason: 'That is not a link to a LinkedIn comment.' }
  }
  const target = post ? linkedinActivityId(post) : undefined
  if (target && target !== activity) {
    return { ok: false, reason: 'That comment is on a different post.' }
  }
  const hasCommentUrn = /commentUrn/i.test(url.search)
  if (!hasCommentUrn) {
    // The activity URL alone IS the post. This used to come back ok with a
    // `platform_only` strength, which meant submitting the promoted post's own
    // link passed the deterministic check on LinkedIn while the identical
    // mistake was caught on X and Reddit.
    return {
      ok: false,
      reason:
        'That links to the post, not to your comment. Open your comment’s menu and copy its link.',
    }
  }
  return {
    ok: true,
    // A LinkedIn comment permalink carries `commentUrn` alongside the activity
    // id. With both, the link is evidence of a comment on that exact post.
    strength: target ? 'post_confirmed' : 'platform_only',
    normalized,
  }
}
