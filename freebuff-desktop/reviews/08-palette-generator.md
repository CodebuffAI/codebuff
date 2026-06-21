# Usability review 08 — Color palette generator

A design tool. Lens: aesthetics polish of the app itself.

## Findings
- **[P2][board] Abandoned tasks cluttered the "Blocked" column**, reading like
  problems when they were intentional drops. → Split into a separate, muted
  **Archived** group at the bottom. (Fixed.)
- **[P3][aesthetics] The activity meter was static** even while the machine works.
  → A subtle pulsing dot when tasks are running, so the app feels alive. (Fixed.)
- **[note] Linear chains can get long.** The orchestrator chained the palette into
  4 sequential tasks; a deep chain means more approve steps and slower parallelism.
  Fine for correctness, but a future idea: allow *parallel* tasks when they touch
  clearly different regions, or let the user "approve through" a chain.
- The palette generator built cleanly (0 conflict retries) — swatches, lock,
  copy-hex, export-CSS.

## Fixed in round 8 (polish)
- **Archived group**: abandoned tasks now live in their own muted section, out of
  Blocked.
- **Running pulse**: the activity meter shows a gentle pulsing dot while tasks run.
