# Usability review 04 — Pomodoro focus timer

Interactive web app. Lens: fewer-clicks / less-typing + watching how scope plays
out across chained tasks. Result: a polished circular-ring timer (modes, ring,
sessions) — viewed live in the Preview panel.

## Findings
- **[P1][scope] Agents over-deliver beyond their task.** The first task ("HTML
  skeleton + CSS") built the ENTIRE 429-line app (timer logic, modes, chime,
  sessions). The chained follow-ups (t2 core logic, t3 chime/sessions) then had
  nothing to do → blocked "No changes produced" → the retry loops forever. Root
  cause: the implement agent doesn't respect task boundaries. → Strengthen the
  implement prompt to do ONLY its task. (Fixed this round.)
- **[P1][flow] "No changes produced" is a confusing dead-end.** It blocks as if
  something's wrong and invites a pointless retry. → Reworded to explain the work
  may already be done and to suggest **Abandon** (fixed). A future nicety: detect
  this and auto-mark "obsolete" instead of "blocked".
- **[P2][board] Abandoned tasks sit in the "Blocked" column** with everything
  else. Abandoned = user chose to drop; it reads as a problem. → Dim/separate or
  hide abandoned. (Polish round.)
- **[clicks] Every review action was select+click.** Added keyboard shortcuts.

## Fixed in round 4
- **Keyboard shortcuts**: j/k move between tasks, a approve, r request-changes,
  p preview, c chat (skipped while typing in a field); a subtle hint in the board.
  Verified `p` opens Preview.
- **Implement-agent scope discipline**: prompt now says implement ONLY this task,
  not other tasks' work — so chained tasks each have real, in-scope work.
- **Clearer "No changes produced"** message that guides to Abandon, not retry.
