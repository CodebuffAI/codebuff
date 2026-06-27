
### Turn 1 (foundation)
- One prompt → 416-line index.html, polished HUD + toolbar + grass grid, **zero console errors**. Strong.
- UX GAP #1 (minor): no "new thread + first message" in one step; UI makes you create an empty tab then type.
- UX GAP #2 (BIG): `/preview` serves the PROJECT ROOT, but each thread works in its own worktree. So the in-app preview can NOT show a thread's in-progress work — fatal for iterative/visual building (games, UI). The product must offer a per-thread preview pointed at that thread's worktree. Had to manually `python3 -m http.server` the worktree to see anything.
- UX GAP #3: no built-in way to "see it running" at all (no run/preview affordance tied to a thread). Verifying your build is the whole point of a tycoon/game build.
- Observation: prompt-cache continuity across turns is the bet — queuing additive feature prompts should accumulate in the same worktree. Testing that next via autorun.

### Driving the rest via queue + autorun

### Autorun drain of 9 turns (5 features + ship workflow)
- WORKED FLAWLESSLY. Drained top-down review→simplify→test→reflect; ~50-90s/turn, ~14.5 min total; index.html 416→1162 lines, coherent across turns (prompt-cache accumulation is real). This is the product's core magic and it delivers.
- suggest_prompts is excellent: proposed scenery tool, multiple trains, entrance fee, pause button, monthly expenses, tab-visibility pause — all genuinely useful, well-scoped. The "suggester" replacement works better than expected.

### Playing the built game (drove it via real synthetic clicks)
- Coaster loop detection works ("🎢 New coaster! Loop of 18 tiles"), cars render + animate on rails. Track/path/entrance art is polished. Rating responds (128). No console errors. Genuinely impressive for ~15 min unattended.
- BUG (gameplay, CRITICAL): guests spawn but never BOARD/PAY — stuck "walking" forever; monthIncome stays $0, cash never rises. The core economy loop is broken.
- BUG (polish): HUD Rating panel wraps to a 2nd row and OVERLAPS the top bar. Help text at bottom OVERLAPS the ENTRANCE label.

### THE BIGGEST PRODUCT FINDING
- The `ship` workflow's `test` skill PASSED a game with a broken core loop. Why: the agent has NO browser-in-the-loop — it can run `node`/build commands but cannot load the page, click, and observe. So "tested" web/UI/game work is only syntactically verified, not behaviorally. This is the #1 thing to fix for "easy to build what you want": the loop must be able to SEE the running app (and so must the human — see preview gap).
- Combined with UX GAP #2 (no per-thread preview), a user building anything visual is flying blind: neither they nor the agent can see it run inside the product.

### Fixes to make to freebuff-desktop (prioritized)
1. PER-THREAD PREVIEW: serve each thread's worktree at /preview/<threadId>/… + a one-click in-app Preview panel in the thread. (Biggest UX win; unblocks "see it run".)
2. Surface backend errors in the UI (queue/PR/message actions fire-and-forget; failures invisible).
3. (Stretch) give the test/review skills a way to exercise the browser, or at least prompt them to, so behavioral bugs get caught.

## Fixes made to Freebuff Desktop (from this dogfood)
1. PER-THREAD PREVIEW (the biggest UX win): new `/thread-preview/<threadId>/…` server route serves files from THAT thread's worktree (falls back to project root). New in-app "Preview"/"Reload"/"Hide preview" header in ThreadView iframes it, so you see a thread's in-progress work running with one click. Added `/thread-preview` to the Vite dev proxy. VERIFIED end-to-end via headless browser: clicking Preview on the game thread renders the live game inline, 0 errors.
2. ERROR SURFACING: added a lightweight toast system (store `toasts`/`pushToast` + `.toasts` UI). `openPr` now reports "Opening PR…", success URL, or failure — previously fire-and-forget actions failed invisibly.
3. TEST SKILL hardened toward BEHAVIORAL verification: the builtin `test` skill now explicitly tells the agent it cannot see the screen and must write+run a short headless script that drives the actual code and asserts state transitions (board → pay → leave; money changes), instead of concluding "works" from reading code. This is the gap that let the broken economy loop pass `ship`.

## Top remaining follow-up (not done — bigger/riskier)
- Give the test/review skills a real browser-in-the-loop tool (headless load + console/error capture + screenshot the agent can read), so behavioral/visual bugs in web/UI/game work are caught automatically. The per-thread preview now lets the HUMAN catch them; the AGENT still can't see pixels. Highest-value next product investment.

## Verdict
Built a polished, working RollerCoaster Tycoon game (coaster building + running cars, paths, guests that ride & pay, economy, rating, clean single-row HUD, no console errors) ENTIRELY by operating the app: one thread → autorun a queue of 5 feature prompts + the `ship` workflow → steer one precise fix message. The thread/queue/workflow/autorun model + suggestions worked excellently. The one real friction (couldn't see the build) is now fixed.
