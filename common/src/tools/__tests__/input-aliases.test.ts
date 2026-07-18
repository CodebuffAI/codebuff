import { describe, expect, it } from 'bun:test'
import z from 'zod/v4'

import { toolParams } from '../list'

describe('tool input compatibility aliases', () => {
  it('repairs a singular read_files path', () => {
    expect(
      toolParams.read_files.inputSchema.parse({ path: 'src/example.ts' }),
    ).toEqual({
      paths: ['src/example.ts'],
    })
  })

  it('repairs singular read_files range and symbol selectors', () => {
    expect(
      toolParams.read_files.inputSchema.parse({
        range: { path: 'src/example.ts', startLine: 2, endLine: 4 },
        symbol: { path: 'src/example.ts', names: 'render' },
      }),
    ).toEqual({
      paths: [],
      ranges: [{ path: 'src/example.ts', startLine: 2, endLine: 4 }],
      symbols: [{ path: 'src/example.ts', names: ['render'] }],
    })
  })

  it('repairs singular path and file aliases on other filesystem tools', () => {
    expect(
      toolParams.read_image.inputSchema.parse({ path: 'preview.png' }),
    ).toEqual({ paths: ['preview.png'] })
    expect(toolParams.read_subtree.inputSchema.parse({ path: 'src' })).toEqual({
      paths: ['src'],
      maxTokens: 4000,
    })
    expect(
      toolParams.get_build_targets.inputSchema.parse({ file: 'src/a.ts' }),
    ).toEqual({ files: ['src/a.ts'] })
    expect(
      toolParams.run_file_change_hooks.inputSchema.parse({ file: 'src/a.ts' }),
    ).toEqual({ files: ['src/a.ts'] })
    expect(
      toolParams.browser_logs.inputSchema.parse({
        type: 'upload',
        selector: '#asset',
        path: 'assets/model.glb',
      }),
    ).toMatchObject({ paths: ['assets/model.glb'] })
  })

  it('repairs singular aliases for object collection tools', () => {
    expect(
      toolParams.ask_user.inputSchema.parse({
        question: {
          question: 'Proceed?',
          header: 'Confirm',
          options: [
            { label: 'Yes', description: 'Proceed' },
            { label: 'No', description: 'Stop' },
          ],
        },
      }).questions,
    ).toHaveLength(1)
    expect(
      toolParams.write_todos.inputSchema.parse({
        todo: { task: 'Test aliases', completed: false },
      }).todos,
    ).toEqual([{ task: 'Test aliases', completed: false }])
    expect(
      toolParams.suggest_followups.inputSchema.parse({
        followup: { prompt: 'Continue' },
      }).followups,
    ).toEqual([{ prompt: 'Continue' }])
  })

  it('repairs singular mutation and agent aliases', () => {
    expect(
      toolParams.str_replace.inputSchema.parse({
        path: 'src/a.ts',
        replacement: { oldString: 'a', newString: 'b' },
      }).replacements,
    ).toHaveLength(1)
    expect(
      toolParams.spawn_agents.inputSchema.parse({
        agent: { agent_type: 'general-agent', params: {} },
      }).agents,
    ).toHaveLength(1)
    expect(
      toolParams.edit_3d_asset.inputSchema.parse({
        path: 'scene.blend',
        sourceHash: 'a'.repeat(64),
        operation: { type: 'set_frame_range', start: 1, end: 10 },
      }).operations,
    ).toHaveLength(1)
  })

  it('repairs mechanical camelCase and snake_case aliases', () => {
    expect(
      toolParams.query_index.inputSchema.parse({
        query: 'garden',
        file_type: 'tsx',
        path_prefix: 'src/components',
      }),
    ).toMatchObject({
      fileTypes: ['tsx'],
      pathPrefixes: ['src/components'],
    })
    expect(
      toolParams.run_targeted_validation.inputSchema.parse({
        snapshotId: 'snapshot-1',
        file: 'src/a.ts',
        artifact_kind: 'source',
      }),
    ).toEqual({
      snapshot_id: 'snapshot-1',
      files: ['src/a.ts'],
      artifact_kinds: ['source'],
    })
  })

  it('keeps canonical fields authoritative when an alias is also present', () => {
    expect(
      toolParams.read_files.inputSchema.parse({
        paths: ['canonical.ts'],
        path: 'alias.ts',
      }),
    ).toEqual({ paths: ['canonical.ts'] })
  })

  it('keeps provider-facing schemas canonical', () => {
    const providerSchema = toolParams.read_files
      .providerInputSchema as z.ZodType
    expect(
      providerSchema.safeParse({
        path: 'src/example.ts',
      }).success,
    ).toBe(false)
    expect(
      providerSchema.safeParse({
        paths: ['src/example.ts'],
      }).success,
    ).toBe(true)
  })
})
