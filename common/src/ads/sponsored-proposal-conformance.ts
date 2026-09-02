/**
 * The sponsored-proposal conformance matrix, as data (COD-376).
 *
 * One numbered check list that Web, Desktop and CLI all report against, so
 * "the terminal card behaves like the web card" is a claim with a shape rather
 * than an impression. A surface's run produces one result per ID — `pass`,
 * `fail`, or `waived: <reason>` — and a surface with any `fail`, or any waiver
 * this file does not list for it, is not conformant.
 *
 * The IDs are the contract and are STABLE. Renumbering them silently
 * invalidates every report already posted on the issue, so a new check is
 * appended at the end of its layer rather than inserted.
 *
 * This is data, not a runner. It exists so two things can be checked
 * mechanically that otherwise depend on someone remembering: that every
 * render-layer ID has a test case referencing it (see
 * `sponsoredProposalConformance.test.ts` beside the Web panel), and that a
 * report's waivers are ones this document actually accepts.
 *
 * The layers, and why they are separate:
 *
 *   VM — the view model in {@link ./sponsored-proposal-view.ts}. Runs ONCE, in
 *        `common`. No surface re-implements these; a surface that did would be
 *        testing its own copy of the state machine rather than the shared one.
 *   R  — render. Per surface, against the shared fixtures in
 *        {@link ./__fixtures__/sponsored-proposal-rows.ts}.
 *   C  — connected. The renderer bound to its transport, with a fake backend.
 *   V  — viewing a run read-only. Only where the surface has such a view.
 *   B  — the gate and billing isolation, against a loopback backend.
 *   E  — end to end, real backend, real user action.
 */

export type SponsoredConformanceLayer = 'VM' | 'R' | 'C' | 'V' | 'B' | 'E'

export type SponsoredConformanceSurface = 'web' | 'desktop' | 'cli'

export type SponsoredConformanceCheck = {
  /** Stable identifier, e.g. `R-14`. Never renumbered. */
  id: string
  layer: SponsoredConformanceLayer
  /** What passing means, in one sentence. */
  check: string
}

const check = (
  layer: SponsoredConformanceLayer,
  entries: string[],
): SponsoredConformanceCheck[] =>
  entries.map((text, index) => ({
    id: `${layer}-${index + 1}`,
    layer,
    check: text,
  }))

/**
 * VM-1..VM-24 map one-to-one onto the `test(...)` cases of
 * `sponsored-proposal-view.test.ts`, IN FILE ORDER.
 *
 * File order rather than a semantic grouping because that is the only mapping
 * a reader can verify against the file without a lookup table — and because
 * two of these cases are loops over states or over hostile inputs, so a
 * "one ID per assertion" numbering would not be stable against adding an
 * eleventh rejected URL.
 *
 * Note for anyone reconciling this with the plan document: the doc says
 * "VM-1 through VM-26". The file has 24 `test(...)` sites; 24 is what is
 * encoded here, and the count is asserted so the two cannot drift again.
 */
const VM_CHECKS = check('VM', [
  'every state names its own outcome',
  'committed names the outcome, not a next step',
  'counts the done steps for the progress counter',
  'absent steps are an empty list, not undefined',
  'step labels read in the todo-dock vocabulary',
  'offered leads with accept',
  'accepted and failed offer no answer beyond the decline',
  'dismiss is available in every state and is not destructive',
  'the standing channel controls are available in every state',
  'running offers the live view only once a thread exists',
  'committed offers the PR decision and the read-only view',
  'committed still offers the PR decision with no thread to view',
  'the read-only view survives into landed',
  'merged links the merged PR under its own label',
  'every hostile pr_url is refused, in landed and in merged',
  'a refused link does not cost the rest of the card',
  'an https pull request passes through',
  'a well-formed logo token becomes the creative-image route',
  'no token is the ordinary no-logo case',
  'a malformed logo token never mints a request',
  'why_this falls back to the channel promise',
  'a failed run promises nothing changed even with no reason',
  'an absent branch is null rather than a guess',
  'the channel menu lists every control, in order',
])

const R_CHECKS = check('R', [
  'every state carries the "Sponsored" disclosure, legible at the surface\'s narrowest width',
  'every state exposes exactly one dismiss affordance',
  'offered shows body, one primary action labelled from accept.label, and the never-billed disclosure',
  'accepted shows the state title and no accept affordance',
  'running renders steps in the SPONSORED_STEP_STATE_LABEL vocabulary and the done/total count',
  'running offers the read-only view only with a thread_ref AND a host handler; otherwise nothing, never a dead control',
  'committed shows no spinner and no running copy',
  'committed names the branch, or drops the clause when branch is null; never guesses',
  'committed offers the PR decision and the read-only view; with no host handlers it renders no action controls',
  'committed states nothing was pushed',
  'landed links the PR and names the branch; the view control survives',
  'failed shows failureReason and promises nothing changed',
  'merged is terminal success with the PR link',
  'for landed and merged, each hostile URL renders no link and the rest of the card survives',
  'an https PR URL renders as a real link (or, on CLI, as the sanitized text the user can open)',
  'a valid logo token renders the creative-image route — same-origin on Web, and on Desktop the absolute freebuff.com URL, since the Desktop shell is not served from it; CLI renders the name only and never fetches',
  'no token and an unusable token render byte-identically, and no request is minted for a malformed token',
  'the channel menu lists Why this / Never {advertiser} / Report / Turn off, in sponsoredProposalMenu order, each handler invoked exactly once',
  'the advertiser name is present as text in every state',
])

const C_CHECKS = check('C', [
  'subscribes or polls the active proposal for the current target only',
  'binds accept, dismiss, report, never-advertiser and opt-out',
  'renders nothing while loading, with no row, or with a dismissed row',
  'sends nothing to the backend while hidden',
  'accept sends one accept for this proposal and nothing else; a double activation sends one',
  'a rejected accept surfaces an error and does not retry',
  'dismiss never accepts; a double dismiss sends one',
  'never-advertiser sends the pref write then a dismiss, in that order',
  'create PR is bound as an action returning {success, message, prUrl?}; success:false is shown, not thrown',
  'a closed gate yields no card and no writes',
])

const V_CHECKS = check('V', [
  'the send target is always the user’s own thread, never the watched one',
  'the transcript pane follows the watched thread; composer and every other sender are disabled',
  'the composer stays hidden for a sponsored thread even if it became the pointer',
  'the card opens the VIEW pointer, never the send pointer',
  'the header discloses "Sponsored" on the watched thread',
  'the view pointer is ephemeral client state; a reload discards it',
])

const B_CHECKS = check('B', [
  'freebuff_daily_usage for the user is unchanged across offer, accept and the terminal state',
  'the proposal row carries surface equal to the surface under test',
  'dismiss on a running row is refused with the "still running" message; report on running records without dismissing',
  'a seeded row has no impression_token and no creative_id',
])

const E_CHECKS = check('E', [
  'a seeded offered row with surface set appears on the surface within one poll interval',
  'a second account signed in at the same time sees nothing',
  'accept moves the row to accepted and the surface shows the state title within one poll interval',
  'running to committed follows each transition on the card',
  'failed with a reason renders the reason',
  'never-advertiser and opt-out each remove the card and suppress the matching re-seed; a running row survives both',
  'create PR from committed moves to landed with a link',
])

export const SPONSORED_CONFORMANCE_CHECKS: SponsoredConformanceCheck[] = [
  ...VM_CHECKS,
  ...R_CHECKS,
  ...C_CHECKS,
  ...V_CHECKS,
  ...B_CHECKS,
  ...E_CHECKS,
]

/**
 * The layers whose IDs must be REFERENCED by a test case rather than reported
 * by hand.
 *
 * VM, R, C and V are all observable from a test file; B and E need a backend
 * and a human respectively, so their results are reported in the issue comment
 * and cannot be checked by a scan.
 */
export const SPONSORED_CONFORMANCE_REFERENCED_LAYERS: SponsoredConformanceLayer[] =
  ['VM', 'R', 'C', 'V']

export function sponsoredConformanceIds(
  layer?: SponsoredConformanceLayer,
): string[] {
  return SPONSORED_CONFORMANCE_CHECKS.filter(
    (entry) => layer === undefined || entry.layer === layer,
  ).map((entry) => entry.id)
}

export function sponsoredConformanceCheck(
  id: string,
): SponsoredConformanceCheck | null {
  return SPONSORED_CONFORMANCE_CHECKS.find((entry) => entry.id === id) ?? null
}

/**
 * The ONLY waivers a Phase 1 report may carry, per surface.
 *
 * A waiver is a promise about what the surface does NOT do yet, so the reason
 * string is part of the contract: two surfaces waiving the same ID for
 * different reasons are two different gaps, and collapsing them to a shared
 * "not implemented" hides which one Phase 2 has to close.
 *
 * Web is deliberately empty. It is the reference implementation; a waiver
 * there is a regression in the thing every other surface is measured against.
 */
export const SPONSORED_CONFORMANCE_ACCEPTED_WAIVERS: Record<
  SponsoredConformanceSurface,
  Record<string, string>
> = {
  web: {},
  desktop: {
    // Accept is ABSENT on Desktop in Phase 1, not stubbed: an Accept that
    // spawns a Cloud thread against a folder that is not a Cloud project is
    // the wrong test, and a disabled button that bills nothing still teaches
    // the user the channel is broken.
    'R-3': 'no execution',
    'R-6': 'no read-only thread view on Desktop',
    'R-9': 'no read-only thread view on Desktop',
    'V-1': 'Phase 2',
    'V-2': 'Phase 2',
    'V-3': 'Phase 2',
    'V-4': 'Phase 2',
    'V-5': 'Phase 2',
    'V-6': 'Phase 2',
    'B-1': 'no execution',
    'E-3': 'no execution',
    'E-4': 'no execution',
    'E-5': 'no execution',
    'E-7': 'no execution',
  },
  cli: {
    // NOTHING PRODUCES A CARD ON THE CLI YET. The block renders, and every
    // render-layer ID is pinned by a test — but no poll fetches a proposal and
    // no code path inserts the block into a transcript. So the three E rows
    // that need a seeded row to ARRIVE cannot be observed at all, and reporting
    // them as `pass` off a hand-inserted block would be reporting the fixture.
    // Distinct from Desktop's 'no execution' on purpose: Desktop polls and
    // shows the card, it just cannot Accept. Phase 2 closes these by adding the
    // producer, not by adding execution.
    'E-1': 'no producer: nothing polls or inserts the block yet (Phase 1)',
    'E-2': 'no producer: nothing polls or inserts the block yet (Phase 1)',
    'E-6': 'no producer: nothing polls or inserts the block yet (Phase 1)',
    'R-3': 'no execution',
    'R-6': 'no read-only view',
    'R-9': 'no read-only view',
    // A terminal cannot make a link; it can only print a destination the user
    // may copy. The sanitizing is the part that still has to hold.
    'R-15': 'renders sanitized text, not a link',
    'V-1': 'Phase 2',
    'V-2': 'Phase 2',
    'V-3': 'Phase 2',
    'V-4': 'Phase 2',
    'V-5': 'Phase 2',
    'V-6': 'Phase 2',
    'B-1': 'no execution',
    'E-3': 'no execution',
    'E-4': 'no execution',
    'E-5': 'no execution',
    'E-7': 'no execution',
  },
}

/**
 * E-6 IS NOT WAIVED ON EITHER SURFACE, and the plan document says both things.
 *
 * Its per-surface "applies in Phase 1" list names E-1, E-2 and E-6; its waiver
 * line then says `E-3..E-7`. Only one of those can be true, and E-6 —
 * never-advertiser and opt-out suppressing the next offer — needs no execution
 * at all: it is a preference write and a re-seed. So E-4, E-5 and E-7 are
 * waived by range and E-6 is not — on DESKTOP. Recorded here because the next
 * reader will hit the same contradiction.
 *
 * The CLI waives E-1, E-2 and E-6 anyway, and for an unrelated reason: nothing
 * on that surface produces a card, so there is no arrival to observe. That is a
 * missing producer, not a missing execution, and the reason string says so.
 */
export function sponsoredConformanceWaiverAccepted(
  surface: SponsoredConformanceSurface,
  id: string,
  reason: string,
): boolean {
  return SPONSORED_CONFORMANCE_ACCEPTED_WAIVERS[surface][id] === reason
}
