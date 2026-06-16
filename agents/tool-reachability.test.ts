import { describe, expect, test } from 'bun:test'

import { createBase2 } from './base2/base2'
import { createCodeEditor } from './editor/editor'

/**
 * Guards against the "registered but unusable" failure mode: a tool can be in
 * the runtime registry + generated types yet absent from every agent's
 * `toolNames`, so no agent can ever call it. (This is exactly what happened to
 * read_outline / read_slices / rewrite_symbol on first add.)
 *
 * read_slices has since been folded into read_files's `symbols` mode and is now
 * a deprecated alias the shipped agents no longer list, so it is intentionally
 * absent from the required set below.
 *
 * The orchestrator (base2, all modes) must expose the structural read/edit
 * tools, and the direct code editor must expose the structural edit tools.
 */
const STRUCTURAL_READ_TOOLS = ['read_outline'] as const
const STRUCTURAL_EDIT_TOOLS = ['rewrite_symbol'] as const
const HARNESS_STATE_TOOLS = ['git_status'] as const

describe('agent tool reachability', () => {
  for (const mode of ['default', 'max', 'fast'] as const) {
    test(`base2 (${mode}) exposes structural read + edit tools`, () => {
      const tools = createBase2(mode).toolNames ?? []
      for (const tool of [...STRUCTURAL_READ_TOOLS, ...STRUCTURAL_EDIT_TOOLS]) {
        expect(tools).toContain(tool)
      }
      // Core read/edit tools must remain reachable too.
      for (const tool of [
        'read_files',
        'str_replace',
        'write_file',
        ...HARNESS_STATE_TOOLS,
      ] as const) {
        expect(tools).toContain(tool)
      }
    })
  }

  test('code editor exposes structural edit + read tools', () => {
    const tools = createCodeEditor({ model: 'opus' }).toolNames ?? []
    for (const tool of [...STRUCTURAL_READ_TOOLS, ...STRUCTURAL_EDIT_TOOLS]) {
      expect(tools).toContain(tool)
    }
  })
})
