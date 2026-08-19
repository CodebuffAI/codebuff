import { describe, expect, it } from 'bun:test'

import { checkCommentUrl } from '../util/ad-comment-url'

const reddit = (commentUrl: string, postUrl = 'https://www.reddit.com/r/programming/comments/abc123/some_slug/') =>
  checkCommentUrl({ platform: 'reddit', postUrl, commentUrl })
const twitter = (commentUrl: string, postUrl = 'https://x.com/acme/status/1234567890') =>
  checkCommentUrl({ platform: 'twitter', postUrl, commentUrl })
const linkedin = (
  commentUrl: string,
  postUrl = 'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/',
) => checkCommentUrl({ platform: 'linkedin', postUrl, commentUrl })

describe('reddit', () => {
  it('confirms a comment permalink under the promoted post', () => {
    const result = reddit(
      'https://www.reddit.com/r/programming/comments/abc123/some_slug/def456/',
    )
    expect(result).toMatchObject({ ok: true, strength: 'post_confirmed' })
  })

  it('accepts old.reddit and redd.it hosts', () => {
    expect(
      reddit('https://old.reddit.com/r/programming/comments/abc123/s/def456/'),
    ).toMatchObject({ ok: true })
  })

  it('rejects a comment on a different post', () => {
    // The check that actually matters: a real comment, on the wrong post, is
    // the cheapest possible forgery and the one a URL CAN catch.
    const result = reddit(
      'https://www.reddit.com/r/programming/comments/zzz999/other/def456/',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('different post')
  })

  it('rejects the post permalink submitted as a comment', () => {
    const result = reddit(
      'https://www.reddit.com/r/programming/comments/abc123/some_slug/',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('permalink')
  })

  it('rejects a link that is not a comments URL at all', () => {
    expect(reddit('https://www.reddit.com/r/programming/').ok).toBe(false)
  })
})

describe('twitter', () => {
  it('accepts a reply, at platform-only strength', () => {
    // A reply's URL carries no reference to its parent, so this is genuinely
    // as far as a URL can go on X. The verdict says so rather than pretending.
    expect(twitter('https://x.com/someone/status/9999999999')).toMatchObject({
      ok: true,
      strength: 'platform_only',
    })
  })

  it('accepts twitter.com as well as x.com', () => {
    expect(
      twitter('https://twitter.com/someone/status/9999999999').ok,
    ).toBe(true)
  })

  it('rejects a link to the promoted post itself', () => {
    // The most common lazy submission: pasting back the link they were given.
    const result = twitter('https://x.com/acme/status/1234567890')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('the post itself')
  })

  it('rejects a profile or non-status URL', () => {
    expect(twitter('https://x.com/someone').ok).toBe(false)
    expect(twitter('https://x.com/someone/status/notanid').ok).toBe(false)
  })
})

describe('linkedin', () => {
  it('confirms a comment permalink carrying the same activity id', () => {
    const result = linkedin(
      'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/?commentUrn=urn%3Ali%3Acomment%3A(activity%3A7000000000000000000%2C7111111111111111111)',
    )
    expect(result).toMatchObject({ ok: true, strength: 'post_confirmed' })
  })

  it('reads the activity id out of the `activity-<id>-` path form too', () => {
    expect(
      linkedin(
        'https://www.linkedin.com/posts/acme_thing-activity-7000000000000000000-Ab1c?commentUrn=urn%3Ali%3Acomment%3A(activity%3A7000000000000000000%2C7111)',
      ),
    ).toMatchObject({ ok: true, strength: 'post_confirmed' })
  })

  it('rejects the activity URL with no comment urn — that is the post', () => {
    // It used to come back ok at `platform_only`, on the reasoning that it was
    // at least the right post. But the submission is supposed to BE a comment,
    // and this URL is the promoted post itself — the same mistake X and Reddit
    // both reject outright. Accepting it here meant the one platform where the
    // lazy submission passed the free check was the one where the URL format
    // made it easiest.
    const result = linkedin(
      'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('not to your comment')
  })

  it('rejects a comment on a different activity', () => {
    const result = linkedin(
      'https://www.linkedin.com/feed/update/urn:li:activity:7999999999999999999/?commentUrn=urn%3Ali%3Acomment%3A(activity%3A7999999999999999999%2C7111)',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('different post')
  })
})

describe('cross-platform and malformed input', () => {
  it('refuses a link on the wrong platform', () => {
    const result = reddit('https://x.com/someone/status/9999999999')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toContain('same platform')
  })

  it('refuses lookalike hosts', () => {
    // Same rule the post-URL validator holds: `includes` would pass these, and
    // the host is the only thing tying a link to a platform.
    expect(twitter('https://x.com.evil.example/a/status/1').ok).toBe(false)
    expect(reddit('https://notreddit.com/r/a/comments/b/c/d/').ok).toBe(false)
  })

  it('refuses non-http schemes and junk', () => {
    expect(twitter('javascript:alert(1)').ok).toBe(false)
    expect(twitter('not a url').ok).toBe(false)
    expect(twitter('').ok).toBe(false)
  })

  it('tolerates an unparseable POST url without crashing', () => {
    // The post URL is validated at creation, but a caller passing junk must
    // degrade to the weaker verdict rather than throw mid-submission.
    expect(
      checkCommentUrl({
        platform: 'twitter',
        postUrl: 'not a url',
        commentUrl: 'https://x.com/someone/status/9999999999',
      }),
    ).toMatchObject({ ok: true, strength: 'platform_only' })
  })
})
