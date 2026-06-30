// Shared time-limit configuration for the cloud agent loops (Freebuff, Codex,
// Claude Code). Centralizing these constants keeps the in-action abort, the
// cron sweep cutoff, and the cloud turn budget in sync across every agent.
//
// Layering:
//   - PER_ACTION_ABORT_MS: each Convex action aborts its own work this far in
//     so it has time to persist state and schedule a continuation before the
//     Convex action limit (~10 min) or the cron sweep reclaims it. This is NOT
//     the user-facing budget; a single turn crosses it by chaining actions.
//   - CRON_SWEEP_TIMEOUT_MS: crash safety net. If an action hard-crashes so its
//     own abort timer never fires, the 1-minute crons reclaim anything stuck
//     longer than this.
//   - CLOUD_TURN_BUDGET_MS: total wall-clock budget for ONE Freebuff Cloud
//     (connected_repo) user turn, summed across chained continuations. This is
//     the configurable "bypass the 10-minute limit" knob (default 20 minutes).

// In-action abort for the per-step CLI/agent work. Stays below the Convex
// ~10-minute action ceiling so the handler has time to persist state and chain
// a continuation. Web/template (non-cloud) uses this 8-minute value — it
// pauses for a manual continue rather than chaining, so the margin only needs
// to cover finalizing the Paused state.
export const PER_ACTION_ABORT_MS = 8 * 60 * 1000

// Cloud (connected_repo) Codex/Claude chaining is the most timing-sensitive
// path: a missed finalization doesn't just pause, it strands the turn. We abort
// at 6 minutes — a 4-minute finalization margin before the ~10-minute Convex
// ceiling — so a slow pkill or mutation can't push us past the ceiling and
// silently break the chain. Tunable independently of web/template.
export const CLOUD_PER_ACTION_ABORT_MS = 6 * 60 * 1000

// Cron sweep cutoff (crash safety net). Mirrors the Convex action ceiling.
export const CRON_SWEEP_TIMEOUT_MS = 10 * 60 * 1000

// Total wall-clock budget for a single Freebuff Cloud turn across chained
// continuations. Configurable; default 20 minutes. Only applies to
// connected_repo (Cloud) projects — web/template projects pause at the
// per-action limit and require a manual continue.
export const CLOUD_TURN_BUDGET_MS = 20 * 60 * 1000

// Backstop cap on the number of chained continuations for a single turn, in
// case a pathological loop somehow stays under the wall-clock budget. With a
// ~9-minute per-action abort and a 20-minute budget this is never the binding
// limit; it's purely defensive.
export const MAX_TURN_CONTINUATIONS = 25

export const CLI_AGENT_TIMEOUT_MESSAGE =
  'Maximum time limit for a prompt reached. Engagement required to continue.'
