import { describe, expect, test } from 'bun:test'

import {
  SPONSORED_STATE_TITLE,
  SPONSORED_STEP_STATE_LABEL,
  sponsoredProposalAction,
  sponsoredProposalMenu,
  sponsoredProposalViewModel,
  type SponsoredProposalRow,
  type SponsoredProposalState,
} from './sponsored-proposal-view'

const ALL_STATES: SponsoredProposalState[] = [
  'offered',
  'accepted',
  'running',
  'committed',
  'landed',
  'failed',
  'merged',
]

const row = (
  overrides: Partial<SponsoredProposalRow>,
): SponsoredProposalRow => ({
  state: 'offered',
  advertiser_name: 'Acme Deploys',
  headline: 'Add one-click deploys to this project',
  body: 'A sponsored agent can wire Acme Deploys into your repo on its own branch.',
  ...overrides,
})

const view = (overrides: Partial<SponsoredProposalRow>) =>
  sponsoredProposalViewModel(row(overrides))

const kinds = (overrides: Partial<SponsoredProposalRow>) =>
  view(overrides).actions.map((action) => action.kind)

describe('state copy', () => {
  test('every state names its own outcome', () => {
    for (const state of ALL_STATES) {
      expect(view({ state }).title).toBe(SPONSORED_STATE_TITLE[state])
      expect(view({ state }).title.length).toBeGreaterThan(0)
    }
  })

  // The state COD-279 exists for: the run finished and stopped, and nothing
  // here may read as though a pull request is pending.
  test('committed names the outcome, not a next step', () => {
    expect(view({ state: 'committed' }).title).toBe(
      'Sponsored thread committed its work',
    )
    expect(view({ state: 'committed' }).title).not.toContain('running')
  })
})

describe('steps', () => {
  const STEPS = [
    { text: 'Install the SDK', state: 'done' as const },
    { text: 'Wire the deploy hook', state: 'active' as const },
    { text: 'Open a pull request', state: 'pending' as const },
  ]

  test('counts the done steps for the progress counter', () => {
    const model = view({ state: 'running', steps: STEPS })
    expect(model.steps).toEqual(STEPS)
    expect(model.doneStepCount).toBe(1)
  })

  test('absent steps are an empty list, not undefined', () => {
    expect(view({ state: 'running' }).steps).toEqual([])
    expect(view({ state: 'running' }).doneStepCount).toBe(0)
  })

  test('reads in the todo-dock vocabulary', () => {
    expect(SPONSORED_STEP_STATE_LABEL).toEqual({
      pending: 'Pending',
      active: 'In progress',
      done: 'Done',
    })
  })
})

describe('actions', () => {
  test('offered leads with accept', () => {
    const accept = sponsoredProposalAction(view({}), 'accept')
    expect(accept?.label).toBe('Start sponsored thread')
    expect(accept?.primary).toBe(true)
  })

  test('accepted and failed offer no answer beyond the decline', () => {
    for (const state of ['accepted', 'failed'] as const) {
      expect(kinds({ state })).toEqual([
        'dismiss',
        'never-advertiser',
        'report',
        'opt-out',
      ])
    }
  })

  // Every state declines the same way, and this is the only decline.
  test('dismiss is available in every state and is not destructive', () => {
    for (const state of ALL_STATES) {
      const dismiss = sponsoredProposalAction(view({ state }), 'dismiss')
      expect(dismiss?.label).toBe('Dismiss sponsored proposal')
      expect(dismiss?.destructive).toBeUndefined()
    }
  })

  // Turning a channel off for good is a different weight of answer from
  // declining one offer.
  test('the standing channel controls are available in every state', () => {
    for (const state of ALL_STATES) {
      const model = view({ state })
      expect(
        sponsoredProposalAction(model, 'report')?.destructive,
      ).toBeUndefined()
      expect(sponsoredProposalAction(model, 'never-advertiser')).toEqual({
        kind: 'never-advertiser',
        label: 'Never show Acme Deploys',
        destructive: true,
      })
      expect(sponsoredProposalAction(model, 'opt-out')?.destructive).toBe(true)
    }
  })

  test('running offers the live view only once a thread exists', () => {
    expect(
      sponsoredProposalAction(
        view({ state: 'running', thread_ref: 'thread-1' }),
        'view-run',
      )?.label,
    ).toBe('Watch this run')
    expect(kinds({ state: 'running' })).not.toContain('view-run')
  })

  // The PR is the user's decision, so `committed` offers to make one and
  // claims none exists.
  test('committed offers the PR decision and the read-only view', () => {
    const model = view({
      state: 'committed',
      branch: 'sponsored/acme-deploys',
      thread_ref: 'thread-1',
    })
    expect(sponsoredProposalAction(model, 'create-pull-request')).toEqual({
      kind: 'create-pull-request',
      label: 'Create pull request',
      primary: true,
    })
    expect(sponsoredProposalAction(model, 'view-run')?.label).toBe(
      'View what it did',
    )
    expect(sponsoredProposalAction(model, 'open-pull-request')).toBeNull()
  })

  test('committed still offers the PR decision with no thread to view', () => {
    expect(kinds({ state: 'committed' })).toContain('create-pull-request')
    expect(kinds({ state: 'committed' })).not.toContain('view-run')
  })

  // Opening the PR must not take the read-only view away.
  test('the read-only view survives into landed', () => {
    const model = view({
      state: 'landed',
      thread_ref: 'thread-1',
      pr_url: 'https://github.com/x/y/pull/7',
    })
    expect(sponsoredProposalAction(model, 'view-run')?.label).toBe(
      'View what it did',
    )
    expect(sponsoredProposalAction(model, 'open-pull-request')?.label).toBe(
      'Review the pull request',
    )
  })

  // One kind, two labels: reviewing a PR the user has not seen and revisiting
  // one that already merged are different sentences.
  test('merged links the merged PR under its own label', () => {
    const model = view({
      state: 'merged',
      pr_url: 'https://github.com/x/y/pull/7',
    })
    expect(sponsoredProposalAction(model, 'open-pull-request')).toEqual({
      kind: 'open-pull-request',
      label: 'view on GitHub',
      href: 'https://github.com/x/y/pull/7',
    })
    expect(kinds({ state: 'merged' })).not.toContain('view-run')
  })
})

/**
 * `pr_url` is the one field on this record that becomes a capability rather
 * than text. The row is written by the sponsored run, so a surface that reads
 * it raw would hand a hostile scheme to a link the user has every reason to
 * click — this channel's whole proposition is that the sponsored thread
 * touched their real repo.
 */
describe('pr_url is https-only before it becomes a destination', () => {
  const REJECTED = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    // Downgrade: a PR we would send the user to over plaintext.
    'http://github.com/x/y/pull/7',
    // Protocol-relative — no scheme at all, so it is unparseable as an
    // absolute URL and must never be guessed into one.
    '//evil.example/pull/7',
    '/x/y/pull/7',
    'github.com/x/y/pull/7',
    'not a url',
    '',
  ]

  for (const state of ['landed', 'merged'] as const) {
    for (const pr_url of REJECTED) {
      test(`${state}: refuses ${JSON.stringify(pr_url)}`, () => {
        const model = view({ state, pr_url })
        expect(model.pullRequestHref).toBeNull()
        // Not just a null href: the action itself is off the menu, so a
        // surface cannot render a link with nowhere to go.
        expect(sponsoredProposalAction(model, 'open-pull-request')).toBeNull()
      })
    }

    // An unusable URL is the absent-field case, exactly like a missing
    // `branch` — the user still learns a sponsored thread reached their repo.
    test(`${state}: a refused link does not cost the rest of the card`, () => {
      const model = view({ state, pr_url: 'javascript:alert(1)' })
      expect(model.title).toBe(SPONSORED_STATE_TITLE[state])
      expect(model.actions.map((action) => action.kind)).toContain('dismiss')
    })

    test(`${state}: passes an https pull request through`, () => {
      expect(
        view({ state, pr_url: 'https://github.com/x/y/pull/7' })
          .pullRequestHref,
      ).toBe('https://github.com/x/y/pull/7')
    })
  }
})

/**
 * A logo token is minted per upload, so a re-upload kills the previous one.
 * Absent, stale and malformed are all ordinary, and none of them may become a
 * request or a path segment.
 */
describe('advertiser logo', () => {
  const TOKEN = '11111111-1111-4111-8111-111111111111'

  test('a well-formed token becomes the creative-image route', () => {
    const model = view({ advertiser_logo_token: TOKEN })
    expect(model.logoToken).toBe(TOKEN)
    expect(model.logoSrc).toBe(`/api/ads/first-party/creative-image/${TOKEN}`)
  })

  test('no token is the ordinary no-logo case', () => {
    expect(view({}).logoToken).toBeNull()
    expect(view({}).logoSrc).toBeNull()
  })

  for (const token of [
    '../../etc/passwd',
    'not-a-token',
    '',
    // Right length, wrong charset: 36 characters outside [0-9a-f-].
    'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
  ]) {
    test(`never mints a request for ${JSON.stringify(token)}`, () => {
      const model = view({ advertiser_logo_token: token })
      expect(model.logoToken).toBeNull()
      expect(model.logoSrc).toBeNull()
    })
  }
})

describe('copy fallbacks', () => {
  test('why_this falls back to the channel promise', () => {
    expect(view({}).whyThis).toContain(
      'never read your code without your go-ahead',
    )
    expect(view({ why_this: 'You use Vercel.' }).whyThis).toBe(
      'You use Vercel.',
    )
  })

  test('a failed run promises nothing changed even with no reason', () => {
    expect(view({ state: 'failed' }).failureReason).toContain(
      'Nothing was changed in your project',
    )
    expect(
      view({ state: 'failed', failure_reason: 'Budget exceeded' })
        .failureReason,
    ).toBe('Budget exceeded')
  })

  // A run old enough to predate the reconciler recording a branch still has to
  // render, and must not invent a branch name it cannot prove.
  test('an absent branch is null rather than a guess', () => {
    expect(view({ state: 'committed' }).branch).toBeNull()
    expect(view({ state: 'committed', branch: '' }).branch).toBeNull()
    expect(view({ state: 'committed', branch: 'sponsored/acme' }).branch).toBe(
      'sponsored/acme',
    )
  })
})

describe('sponsoredProposalMenu', () => {
  test('lists every channel control, in order', () => {
    expect(sponsoredProposalMenu('Acme Deploys')).toEqual([
      { key: 'why', label: 'Why this?' },
      { key: 'never-advertiser', label: 'Never show Acme Deploys' },
      { key: 'report', label: 'Report this proposal' },
      {
        key: 'opt-out',
        label: 'Turn off sponsored proposals',
        separatorBefore: true,
      },
    ])
  })
})
