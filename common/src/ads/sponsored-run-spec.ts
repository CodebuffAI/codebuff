/**
 * The sponsored RUN SPEC: everything a client needs to run an accepted
 * sponsored task, built by the server and delivered on the funded Accept.
 *
 * Before this, each client compiled its own copy of the run prompt (the
 * consent framing, how-to-carry-it-out rules, the deferred-account rules and
 * the final report) and resolved the skill, and so the packages it may
 * install, from its own bundled registry first. A skill version or prompt
 * change then needed a client release, and a build that could not resolve a
 * new skill refused that skill's own pinned install (Exa 2.0.0, 2026-10-13).
 *
 * The server builds it with `buildSponsoredRunSpec`
 * (`./sponsored-run-prompt.ts`).
 *
 * With a spec the server is the one source of truth: the client runs
 * `promptTemplate` with its two slots filled, drives `skill`'s steps and
 * installs only `declaredPackages`. It never substitutes a bundled skill or a
 * prompt of its own. A client says it can run a spec with
 * `runSpecVersion: SPONSORED_RUN_SPEC_VERSION` on the agentic offer request
 * and on the Accept body; the server returns `runSpec` on the Accept only
 * then, and a client that sends neither keeps the legacy path.
 */


import type { SponsoredDeclaredPackage } from './sponsored-declared-installs'
import type { SponsoredSkill } from './sponsored-skill'

/** The spec version a client can run (offer request + Accept body field `runSpecVersion`). */
export const SPONSORED_RUN_SPEC_VERSION = 1 as const

/** Whether a request's `runSpecVersion` asks for this server's run spec. */
export function clientRunsSponsoredRunSpec(value: unknown): boolean {
  return value === SPONSORED_RUN_SPEC_VERSION
}

/**
 * The client-side facts the server cannot know, as literal slots in
 * `promptTemplate`, both after the procedure. The client fills them with
 * {@link fillSponsoredRunSpecPrompt} (an empty string when it has nothing),
 * and changes nothing else.
 */
export const SPONSORED_RUN_SPEC_SLOTS = {
  /** The user's own recent messages, rendered as the read-only background section. */
  taskContext: '{{FREEBUFF_TASK_CONTEXT}}',
  /** The credentials connected for this run, rendered as the credentials section. */
  credentials: '{{FREEBUFF_CREDENTIALS}}',
} as const

export type SponsoredRunSpec = Readonly<{
  v: typeof SPONSORED_RUN_SPEC_VERSION
  /** The procedure exactly as consented to; equals the Accept's `procedure`. */
  procedure: string
  /** `sponsoredProcedureSha256(procedure)`; equals the grant's `procedureSha256`. */
  procedureSha256: string
  /**
   * The skill the procedure renders, verified server-side
   * (`sponsoredSkillMatchesProcedure`). Null only for a legacy free-text
   * procedure, which is being retired.
   */
  skill: SponsoredSkill | null
  /**
   * The only packages the run may install (`evaluateSponsoredInstallCommand`):
   * `skill.packages`, or empty for free text. Carried separately so a client
   * never derives it from anything but this spec.
   */
  declaredPackages: readonly SponsoredDeclaredPackage[]
  /**
   * The full first-turn prompt for the accepting surface, with the
   * {@link SPONSORED_RUN_SPEC_SLOTS} left in place for the client to fill.
   */
  promptTemplate: string
}>

/**
 * Fills a spec's slots. The client renders each section with its own data
 * (`renderSponsoredRunTaskContext` for the messages; its credentials note);
 * an absent section is an empty string, and an empty credentials section
 * takes its paragraph with it.
 *
 * Each slot is replaced exactly once, at its LAST occurrence in the template,
 * in one pass over the template: the slots follow the procedure, so slot-like
 * text in a procedure stays as written, and text a section brings in (the
 * user's own messages, an advertiser name) is never read for a slot.
 */
export function fillSponsoredRunSpecPrompt(
  promptTemplate: string,
  sections: { taskContext: string; credentials: string },
): string {
  const fills = [
    {
      slot: SPONSORED_RUN_SPEC_SLOTS.taskContext,
      text: sections.taskContext,
      at: promptTemplate.lastIndexOf(SPONSORED_RUN_SPEC_SLOTS.taskContext),
    },
    {
      slot: SPONSORED_RUN_SPEC_SLOTS.credentials,
      text: sections.credentials,
      at: promptTemplate.lastIndexOf(SPONSORED_RUN_SPEC_SLOTS.credentials),
    },
  ]
    .filter((fill) => fill.at >= 0)
    .sort((a, b) => b.at - a.at)
  let filled = promptTemplate
  // From the end, so an earlier slot's index still holds.
  for (const { slot, text, at } of fills) {
    let start = at
    if (
      slot === SPONSORED_RUN_SPEC_SLOTS.credentials &&
      text === '' &&
      filled.slice(at - 2, at) === '\n\n'
    )
      start = at - 2
    filled = filled.slice(0, start) + text + filled.slice(at + slot.length)
  }
  return filled
}

/**
 * The optional field on the funded Accept's 200
 * (`POST /api/v1/ads/proposal/{id}/accept`), present only when the request
 * sent `runSpecVersion`. The preview (`GET`) never carries one: the prompt
 * depends on the accepting surface and the advertiser link, which only the
 * funded Accept knows.
 */
export type SponsoredAcceptRunSpec = {
  runSpec?: SponsoredRunSpec
}

