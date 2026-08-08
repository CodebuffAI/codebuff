import { describe, expect, test } from 'bun:test'

import {
  detectForeignFreebuffClient,
  FREEBUFF_DOWNGRADE_MODEL_ID,
  FREEBUFF_SIGNATURE_TOOL_NAMES,
  GENERIC_TOOL_NAMES,
  resolveForeignClientDowngrade,
} from '../constants/foreign-client-signals'
import { toolNames } from '../tools/constants'

function tools(...names: string[]) {
  return names.map((name) => ({ type: 'function', function: { name } }))
}

/** Toolsets observed on real freebuff traffic over 24h of DeepSeek V4 Flash. */
const FREEBUFF_TOOLSETS = [
  // CLI / desktop root agent
  tools(
    'ask_user',
    'basher',
    'browser_use',
    'code_reviewer_deepseek_flash',
    'code_searcher',
    'context_pruner',
    'file_picker',
    'glob',
    'gravity_index',
    'list_directory',
    'read_files',
    'read_subtree',
  ),
  // desktop thread agent
  tools(
    'basher',
    'browser_check',
    'code_reviewer_deepseek_flash',
    'code_searcher',
    'context_pruner',
    'end_turn',
    'file_picker',
    'glob',
    'list_directory',
    'preview_click',
    'preview_evaluate',
  ),
  // chat surface
  tools(
    'context_pruner',
    'gravity_index',
    'render_ui',
    'researcher_web',
    'spawn_agents',
    'suggest_followups',
    'thinker_gemini',
  ),
  // helper agent
  tools('add_message', 'read_files', 'run_terminal_command', 'set_output'),
]

/** Toolsets observed proxying our free endpoint, by harness. */
const FOREIGN_TOOLSETS: Array<[string, ReturnType<typeof tools>]> = [
  ['claude-code', tools('Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write')],
  [
    'opencode',
    tools(
      'ask',
      'bash',
      'edit',
      'eval',
      'glob',
      'grep',
      'hub',
      'read',
      'task',
      'todo',
      'web_search',
      'write',
    ),
  ],
  [
    'cline',
    tools(
      'list_files',
      'read_file',
      'replace_in_file',
      'search_files',
      'write_file',
    ),
  ],
  [
    'novel-farm',
    tools(
      'check_consistency',
      'commit_chapter',
      'draft_chapter',
      'edit_chapter',
      'novel_context',
      'plan_chapter',
      'read_chapter',
    ),
  ],
  [
    'pentest-harness',
    tools(
      'analyze_target_graph',
      'delegate_task',
      'edit_source_code',
      'execute_command',
      'install_tool',
      'python_execute',
      'read_file',
    ),
  ],
]

describe('detectForeignFreebuffClient', () => {
  test('the signature is every non-generic tool we define', () => {
    // Derived, not hand-listed: a tool added to `toolNames` joins the signature
    // automatically. That is the rot that flagged researcher-web — a
    // hand-picked list simply never grew to cover it.
    const known = new Set<string>(toolNames)
    for (const name of known) {
      expect(FREEBUFF_SIGNATURE_TOOL_NAMES.has(name)).toBe(
        !GENERIC_TOOL_NAMES.has(name),
      )
    }
    // Every generic name must be one we actually define, or it is dead weight.
    for (const name of GENERIC_TOOL_NAMES) {
      expect(known.has(name)).toBe(true)
    }
    expect(FREEBUFF_SIGNATURE_TOOL_NAMES.size).toBeGreaterThan(20)
  })

  test('clears real freebuff toolsets', () => {
    for (const toolset of FREEBUFF_TOOLSETS) {
      expect(detectForeignFreebuffClient({ tools: toolset }).signal).toBeNull()
    }
  })

  test.each(FOREIGN_TOOLSETS)('flags %s', (_name, toolset) => {
    expect(detectForeignFreebuffClient({ tools: toolset }).signal).toBe(
      'foreign_toolset',
    )
  })

  test('sharing a few generic names does not launder a foreign harness', () => {
    // opencode sends `glob` and `web_search`, which we define — but both are
    // generic, so neither is in the signature and the overlap buys it nothing.
    expect(
      detectForeignFreebuffClient({
        tools: tools('glob', 'web_search', 'bash', 'edit', 'write'),
      }).signal,
    ).toBe('foreign_toolset')
  })

  test('a toolset of only generic names is foreign', () => {
    // Measured over 30 days: 406 users on spoofed `base2-free-*` agent ids send
    // a bare `web_search` and nothing else. No agent we ship has a toolset of
    // only generic names — every single-tool agent of ours uses a distinctive
    // one (`run_terminal_command`, `spawn_agents`, `read_docs`, `set_output`).
    expect(
      detectForeignFreebuffClient({ tools: tools('web_search') }).signal,
    ).toBe('foreign_toolset')
    expect(
      detectForeignFreebuffClient({ tools: tools('glob', 'web_search') }).signal,
    ).toBe('foreign_toolset')
  })

  test('our toolset wins over sampling params', () => {
    // 16 users in one day sent our tools AND set params. Downgrading them is
    // the false positive this ordering exists to prevent.
    expect(
      detectForeignFreebuffClient({
        tools: tools('ask_user', 'read_files'),
        temperature: 0.3,
        max_tokens: 32000,
      }).signal,
    ).toBeNull()
  })

  test('flags sampling params only when no tools are offered', () => {
    expect(detectForeignFreebuffClient({ temperature: 0.7 }).signal).toBe(
      'sampling_params',
    )
    expect(detectForeignFreebuffClient({ top_p: 0.9 }).signal).toBe(
      'sampling_params',
    )
    expect(detectForeignFreebuffClient({ max_tokens: 4096 }).signal).toBe(
      'sampling_params',
    )
    expect(
      detectForeignFreebuffClient({ max_completion_tokens: 4096 }).signal,
    ).toBe('sampling_params')
  })

  test('clears a tool-free request that leaves sampling params unset', () => {
    // Our helper agents (chat titles, compaction) send no tools at all.
    expect(detectForeignFreebuffClient({}).signal).toBeNull()
    expect(detectForeignFreebuffClient({ tools: [] }).signal).toBeNull()
  })

  test('explicit nulls are not treated as set', () => {
    // Regression: this test used to pass `undefined` while claiming to cover
    // `null`, so it passed against a detector that flagged every explicit
    // null. A client that serializes its whole body sends `temperature: null`
    // rather than omitting the key, and that is unset.
    for (const body of [
      { temperature: null },
      { top_p: null },
      { max_tokens: null },
      { max_completion_tokens: null },
      { temperature: null, top_p: null, max_tokens: null },
    ]) {
      expect(detectForeignFreebuffClient(body as never).signal).toBeNull()
    }
    expect(
      detectForeignFreebuffClient({
        temperature: undefined,
        top_p: undefined,
        max_tokens: undefined,
      }).signal,
    ).toBeNull()
  })

  test('zero is a real choice and stays flagged', () => {
    // `!= null` must not swallow falsy-but-set values.
    expect(detectForeignFreebuffClient({ temperature: 0 }).signal).toBe(
      'sampling_params',
    )
    expect(detectForeignFreebuffClient({ top_p: 0 }).signal).toBe(
      'sampling_params',
    )
  })

  test('tolerates malformed tool entries without throwing', () => {
    for (const tools of [null, undefined, 'nope', [], [null], [{}], [{ function: {} }]]) {
      expect(() =>
        detectForeignFreebuffClient({ tools } as never),
      ).not.toThrow()
    }
    // Tools present but unparseable read as "no tools offered", so the request
    // falls through to the param check rather than being flagged on a name
    // list we could not actually read.
    expect(detectForeignFreebuffClient({ tools: [{}] }).signal).toBeNull()
  })

  test('truncates caller-controlled tool names before they reach logs', () => {
    const verdict = detectForeignFreebuffClient({
      tools: [{ type: 'function', function: { name: 'x'.repeat(5000) } }],
    })
    expect(verdict.signal).toBe('foreign_toolset')
    expect(verdict.sampleToolNames[0]!.length).toBeLessThanOrEqual(64)
  })

  test('reports bounded evidence for the log line', () => {
    const verdict = detectForeignFreebuffClient({
      tools: tools('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'),
    })
    expect(verdict.toolCount).toBe(10)
    expect(verdict.sampleToolNames).toHaveLength(8)
  })

  test.each([
    ['researcher-web', ['web_search', 'read_url']],
    ['researcher-docs', ['read_docs']],
    ['freebuff-desktop-autorun', ['decide']],
    ['basher', ['run_terminal_command']],
    ['file-picker', ['spawn_agents']],
  ])('clears our own %s toolset', (_agent, names) => {
    // Backtested over 30 days against the signature alone: researcher-web was
    // flagged on 100% of 334,042 requests from 4,821 users, autorun on 100% of
    // 2,904 from 41. `web_search` cannot join the signature (opencode ships
    // it), so these clear by the every-tool-is-ours rule instead.
    expect(detectForeignFreebuffClient({ tools: tools(...names) }).signal).toBeNull()
  })

  test('borrowing one distinctive name clears an otherwise foreign toolset', () => {
    // Known and accepted, not an oversight. `some` semantics are what let an
    // MCP user attach `ghidra__*` alongside our tools without being flagged,
    // and the cost is that a proxy declaring one of our names is cleared too.
    // Self-limiting: the borrowed name becomes a GENERIC_TOOL_NAMES candidate
    // the moment it shows up in the logs, and the proxy has to actually
    // implement the tool for its own loop to keep working.
    expect(
      detectForeignFreebuffClient({ tools: tools('read_files', 'Bash') }).signal,
    ).toBeNull()
  })

  test('a root agent offering no tools is a bare completion proxy', () => {
    // Our roots always ship their toolset — that is what makes them agentic.
    // Measured over 7 days with assistant-response rows excluded, the desktop
    // roots send zero tool-free requests (0 of 683,151 for -v3, 0 of 294,823
    // for -worktree) and the CLI roots 0.30%/2.81%. All 18 users sampled across
    // that tail were non-coding automation.
    expect(detectForeignFreebuffClient({}, true).signal).toBe(
      'root_agent_no_tools',
    )
    // Sampling params do not change the verdict for a root.
    expect(detectForeignFreebuffClient({ temperature: 0.7 }, true).signal).toBe(
      'root_agent_no_tools',
    )
  })

  test('a root agent sending our tools is still ours', () => {
    // Evading root_agent_no_tools means sending our toolset, at which point the
    // toolset check applies instead — the same convergent property.
    expect(
      detectForeignFreebuffClient({ tools: tools('ask_user') }, true).signal,
    ).toBeNull()
    expect(
      detectForeignFreebuffClient({ tools: tools('Bash', 'Edit') }, true).signal,
    ).toBe('foreign_toolset')
  })

  test('a tool-free SUBagent is untouched', () => {
    // Our helper agents (chat titles, compaction, researcher-docs) legitimately
    // send no tools; only ROOT agents are agentic by definition. Defaulting
    // isRootAgent to false keeps every non-root caller on the old behaviour.
    expect(detectForeignFreebuffClient({}).signal).toBeNull()
    expect(detectForeignFreebuffClient({}, false).signal).toBeNull()
  })

  test('downgrade target is the free OpenRouter variant', () => {
    expect(FREEBUFF_DOWNGRADE_MODEL_ID).toBe('inclusionai/ling-3.0-tiny:free')
    expect(FREEBUFF_DOWNGRADE_MODEL_ID.endsWith(':free')).toBe(true)
  })
})

describe('resolveForeignClientDowngrade', () => {
  const foreign = { tools: tools('Bash', 'Edit') }
  const params = { max_completion_tokens: 977_725 }
  const ours = { tools: tools('ask_user', 'read_files') }

  test('always downgrades a foreign toolset', () => {
    // Third-party clients are a terms violation: Freebuff funds free inference
    // with ads only our own clients render, so a proxied request takes the
    // cost and returns none of the revenue. There is no mode in which this is
    // served what it asked for.
    expect(resolveForeignClientDowngrade({ body: foreign })!.downgradeTo).toBe(
      FREEBUFF_DOWNGRADE_MODEL_ID,
    )
  })

  test('reports but never acts on a tool-free root agent', () => {
    // Deliberately report-only. The 30-day backtest found 3,729 users who mix
    // tool-free root requests into real agentic traffic, 999 of whose sessions
    // contain both — enforcing per-request swaps the model mid-session for real
    // coding runs. Only 417 users are pure proxies, and no run-length threshold
    // separates them (the MIXED cohort holds the longest tool-free run, 11,094,
    // vs 2,153 for the proxies). Flipping this to enforce needs an
    // account-level verdict, not a change here.
    const d = resolveForeignClientDowngrade({ body: {}, isRootAgent: true })!
    expect(d.signal).toBe('root_agent_no_tools')
    expect(d.downgradeTo).toBeNull()
  })

  test('leaves a tool-free non-root request alone', () => {
    expect(resolveForeignClientDowngrade({ body: {} })).toBeNull()
  })

  test('reports but never acts on the sampling-param signal', () => {
    const decision = resolveForeignClientDowngrade({ body: params })!
    expect(decision.signal).toBe('sampling_params')
    expect(decision.downgradeTo).toBeNull()
  })

  test('a freebuff toolset is never reported', () => {
    expect(resolveForeignClientDowngrade({ body: ours })).toBeNull()
  })

  test('does not re-downgrade a request already on the downgrade model', () => {
    const decision = resolveForeignClientDowngrade({
      body: { ...foreign, model: FREEBUFF_DOWNGRADE_MODEL_ID },
    })!
    expect(decision.signal).toBe('foreign_toolset')
    expect(decision.downgradeTo).toBeNull()
  })
})
