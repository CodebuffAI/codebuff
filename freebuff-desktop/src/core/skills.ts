/**
 * Skill store. A skill is a reusable named prompt — a markdown file under
 * `<project>/.freebuff/skills/<name>.md`. Queuing a skill (or a workflow that
 * contains it) turns its body into the prompt for one agent turn.
 *
 * Built-in skills ship as fallback bodies and are seeded to disk on first open
 * so they're editable like governing docs. A user-authored file overrides the
 * builtin of the same name.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import type { Skill } from './types'
import { slugify } from './worktree'

/**
 * Built-in skill bodies. Each is a single-turn instruction the full coding agent
 * runs against the current worktree. `reflect` leans on the engine's `write_doc`
 * tool; `open-pr` and `merge` drive `git`/`gh` directly via the shell.
 */
export const BUILTIN_SKILLS: Record<string, string> = {
  review:
    'Adversarially review the change you have made so far in this worktree. Trace ' +
    'the actual code paths and look for the way it breaks: off-by-one and boundary ' +
    'errors, null/undefined and empty-input handling, async/order-of-initialization ' +
    'bugs, state that gets out of sync, resource leaks, and cases the work clearly ' +
    'intends but the code misses. Read the surrounding code, not just your diff. For a ' +
    'web UI/page/game, call the `browser_check` tool to confirm it actually renders ' +
    'without console/page errors — a blank render or an error is a defect no matter how ' +
    'clean the code reads. Fix any genuine correctness or security defect you find by ' +
    'editing files directly. Do NOT churn on style, naming, or speculative hardening. ' +
    'Briefly report what you checked and what you fixed.',

  simplify:
    'Make the change you have made smaller and cleaner WITHOUT altering its behavior: ' +
    'reuse existing code and utilities instead of adding new ones, delete anything ' +
    'unnecessary, and improve naming. Do not add features. Briefly report what you ' +
    'simplified.',

  test:
    'Verify the change you made actually BEHAVES correctly — not just that it renders or ' +
    'compiles. Decide what is worth checking, then run the project\'s build/test commands ' +
    'and exercise the real surface. You cannot see the screen by reading code, so use your ' +
    'tools: for a web UI/page/game, call `browser_check` to load it in a real browser and ' +
    'confirm it renders with no console/page errors; for any real logic or stateful behavior ' +
    '(a game loop, a simulation, pathfinding, an economy, a parser, validation), write and RUN ' +
    'a short headless script (e.g. `node -e "..."` or a temp file) that drives the actual code ' +
    'and ASSERTS the expected state transitions and outputs — trace the full lifecycle, including ' +
    'the steps that are easy to get wrong (e.g. does a guest actually board, pay, and leave; does ' +
    'money actually change). Fix anything that fails. Report exactly what you ran and what you observed.',

  reflect:
    'Reflect on the work in this thread and capture durable learnings for the project. ' +
    'Use the `write_doc` tool to append concise, generally-useful notes to the ' +
    '`learning` doc (and `technical` if it captures an architecture decision) — things ' +
    'a future change here would benefit from knowing. Keep it lean; do not restate the ' +
    'obvious. If there is nothing worth recording, say so and do nothing.',

  'open-pr':
    'Open a pull request for the work in this thread yourself, using the shell — there is ' +
    'no dedicated PR tool. First make sure the work is in a good state (build/tests pass). ' +
    'Then, from this worktree, run the git/gh commands with `run_terminal_command`:\n' +
    '1. `git add -A` and commit with a clear, descriptive message.\n' +
    '2. `git push -u origin HEAD` to push the current branch.\n' +
    '3. `gh pr create --fill` (add `--base <default-branch>` if it is not `main`).\n' +
    'If the repo has no remote or `gh` is unavailable, commit locally and say so instead. ' +
    'Report the resulting PR URL.',

  merge:
    'Merge the open pull request for the work in this thread — but only if it is genuinely ' +
    'ready. Using `run_terminal_command`: run `gh pr checks` to confirm CI is passing and ' +
    '`gh pr view` to sanity-check the title, description, and that the diff matches the ' +
    "intent. If every check passes and the change looks correct, merge it with " +
    '`gh pr merge --squash` (use `--auto` if checks are still running so it lands once they ' +
    'go green). If any check is failing, the PR is a draft, or the change looks wrong, do ' +
    'NOT merge — report exactly what is blocking and stop.',
}

/** Built-in skill names, in a stable order for listing. */
export const BUILTIN_SKILL_NAMES = Object.keys(BUILTIN_SKILLS)

/** Make a registry skill name safe to use as a `<name>.md` filename and a queue
 *  command (`/<name>`): the same slug rules as branch names, just a longer cap. */
export function sanitizeSkillName(name: string): string {
  return slugify(name, { maxLen: 64, fallback: 'skill' })
}

/** Default workflows seeded into a fresh project. */
export const DEFAULT_WORKFLOWS: Record<string, string[]> = {
  ship: ['review', 'simplify', 'test', 'reflect'],
}

export class SkillStore {
  private readonly skillsDir: string
  /** User-home skills, shared across every project — where acquired skills land
   *  so they show up regardless of which repo is open. */
  private readonly globalSkillsDir?: string

  constructor(opts: { skillsDir: string; globalSkillsDir?: string }) {
    this.skillsDir = opts.skillsDir
    this.globalSkillsDir = opts.globalSkillsDir
  }

  path(name: string): string {
    return join(this.skillsDir, `${name}.md`)
  }

  /** Read a skill: project file (user override) → global file → builtin fallback. */
  read(name: string): Skill | null {
    const p = this.path(name)
    if (existsSync(p)) {
      return { name, prompt: readFileSync(p, 'utf8'), builtin: !!BUILTIN_SKILLS[name] }
    }
    if (this.globalSkillsDir) {
      const g = join(this.globalSkillsDir, `${name}.md`)
      if (existsSync(g)) return { name, prompt: readFileSync(g, 'utf8'), builtin: false }
    }
    if (BUILTIN_SKILLS[name]) {
      return { name, prompt: BUILTIN_SKILLS[name], builtin: true }
    }
    return null
  }

  /** All skills: builtins ∪ project files ∪ global files (deduped by name). */
  list(): Skill[] {
    const names = new Set<string>(BUILTIN_SKILL_NAMES)
    for (const dir of [this.skillsDir, this.globalSkillsDir]) {
      if (dir && existsSync(dir)) {
        for (const f of readdirSync(dir)) {
          if (f.endsWith('.md')) names.add(f.slice(0, -3))
        }
      }
    }
    return [...names].sort().map((n) => this.read(n)!).filter(Boolean)
  }

  /** Write a user-defined skill or override a builtin (project-scoped). */
  write(name: string, prompt: string): void {
    mkdirSync(this.skillsDir, { recursive: true })
    writeFileSync(this.path(name), prompt)
  }

  /** Save an acquired skill to the user-home dir so it appears for any project.
   *  Falls back to the project dir if no global dir is configured. */
  writeGlobal(name: string, prompt: string): void {
    if (!this.globalSkillsDir) return this.write(name, prompt)
    mkdirSync(this.globalSkillsDir, { recursive: true })
    writeFileSync(join(this.globalSkillsDir, `${name}.md`), prompt)
  }

  /** Seed any missing builtin skill files on first open, so they're editable. */
  seedDefaults(): void {
    mkdirSync(this.skillsDir, { recursive: true })
    for (const [name, body] of Object.entries(BUILTIN_SKILLS)) {
      const p = this.path(name)
      if (!existsSync(p)) writeFileSync(p, body)
    }
  }
}
