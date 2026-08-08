import { describe, expect, test } from 'bun:test'

import {
  detectForeignFreebuffClient,
  FREEBUFF_DOWNGRADE_MODEL_ID,
  FREEBUFF_SIGNATURE_TOOL_NAMES,
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
  test('every signature tool name still exists in toolNames', () => {
    // A rename in common/src/tools/constants.ts must break here rather than
    // silently emptying the signature and downgrading every free user.
    const known = new Set<string>(toolNames)
    expect(
      [...FREEBUFF_SIGNATURE_TOOL_NAMES].filter((name) => !known.has(name)),
    ).toEqual([])
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

  test('generic names shared with other harnesses do not clear a request', () => {
    // opencode sends both `glob` and `web_search`, which are in toolNames.
    // Matching the full list instead of the distinctive subset would clear it.
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

  test('downgrade target is the free OpenRouter variant', () => {
    expect(FREEBUFF_DOWNGRADE_MODEL_ID).toBe('inclusionai/ling-3.0-tiny:free')
    expect(FREEBUFF_DOWNGRADE_MODEL_ID.endsWith(':free')).toBe(true)
  })
})

describe('resolveForeignClientDowngrade', () => {
  const foreign = { tools: tools('Bash', 'Edit') }
  const params = { max_completion_tokens: 977_725 }
  const ours = { tools: tools('ask_user', 'read_files') }

  test('off reports nothing at all', () => {
    expect(resolveForeignClientDowngrade({ body: foreign, mode: 'off' })).toBeNull()
    expect(resolveForeignClientDowngrade({ body: params, mode: 'off' })).toBeNull()
  })

  test('log reports both signals but downgrades neither', () => {
    for (const body of [foreign, params]) {
      const decision = resolveForeignClientDowngrade({ body, mode: 'log' })
      expect(decision).not.toBeNull()
      expect(decision!.downgradeTo).toBeNull()
    }
  })

  test('enforce-toolset downgrades only the toolset signal', () => {
    expect(
      resolveForeignClientDowngrade({ body: foreign, mode: 'enforce-toolset' })!
        .downgradeTo,
    ).toBe(FREEBUFF_DOWNGRADE_MODEL_ID)
    // Our own CLI shape: tool-free with max_completion_tokens. Reported, not acted on.
    const paramDecision = resolveForeignClientDowngrade({
      body: params,
      mode: 'enforce-toolset',
    })!
    expect(paramDecision.signal).toBe('sampling_params')
    expect(paramDecision.downgradeTo).toBeNull()
  })

  test('enforce downgrades both signals', () => {
    for (const body of [foreign, params]) {
      expect(
        resolveForeignClientDowngrade({ body, mode: 'enforce' })!.downgradeTo,
      ).toBe(FREEBUFF_DOWNGRADE_MODEL_ID)
    }
  })

  test('a freebuff toolset is never reported in any mode', () => {
    for (const mode of ['log', 'enforce-toolset', 'enforce'] as const) {
      expect(resolveForeignClientDowngrade({ body: ours, mode })).toBeNull()
    }
  })

  test('does not re-downgrade a request already on the downgrade model', () => {
    const decision = resolveForeignClientDowngrade({
      body: { ...foreign, model: FREEBUFF_DOWNGRADE_MODEL_ID },
      mode: 'enforce',
    })!
    expect(decision.signal).toBe('foreign_toolset')
    expect(decision.downgradeTo).toBeNull()
  })
})
