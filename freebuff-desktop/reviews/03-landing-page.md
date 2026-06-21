# Usability review 03 — Freebuff Desktop landing page

A one-page marketing site (single index.html). Lens: **aesthetics** (a landing
page is all about polish) + the standing lenses, plus verifying the round-3
decomposition fix.

## Fixed in round 3
- **Same-file tasks now chain instead of conflicting.** Carried over from review
  02: the orchestrator over-decomposed single-file work into parallel tasks that
  collided at merge. Updated the orchestrator prompt to chain tasks that touch a
  shared file (skeleton → features). **Verified:** for this landing page it made
  t2 depend on t1 (no parallel index.html edits) → a clean, conflict-free build
  (0 retries, vs. 2 retries for the comparable notes app last round).

## Findings (aesthetics / flow)
- The build was smooth and the result is a real 513-line landing page (gradient
  hero, 3-feature row, how-it-works, footer) — viewed live in the Preview panel.
- **[P2][preview] White flash + constrained width.** The preview iframe defaults to
  a white background (jarring before a dark page paints) and is only as wide as the
  center pane — a landing page wants more room. → Dark iframe background; a
  "fullscreen preview" toggle for design-heavy pages. (Later round.)
- **[P3][aesthetics] App is clean overall** (post-overhaul). Small nits: the
  segmented tab labels could carry icons; the activity meter could animate when a
  task is running. Cosmetic — parking for a polish round.
- **[idea] Auto-open Preview when a web task merges** — after merging a visual
  change you almost always want to see it; the app could offer "View result". Saves
  clicks. (Candidate.)
