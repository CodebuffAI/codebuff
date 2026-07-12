import { describe, expect, it } from 'bun:test'
import { getContentHash } from '@codebuff/common/util/content-hash'

import {
  coordinateEditApplication,
  editOutputHasError,
} from '../edit-application-coordinator'
import { getFileProcessingValues } from '../write-file'

describe('edit application coordinator', () => {
  it('detects explicit errors in later and nested output parts', () => {
    expect(
      editOutputHasError([
        { type: 'json', value: { message: 'prepared' } },
        {
          type: 'json',
          value: { nested: { applied: false, message: 'rejected' } },
        },
      ] as any),
    ).toBe(true)
    expect(
      editOutputHasError([
        { type: 'json', value: { message: 'applied', error: null } },
      ] as any),
    ).toBe(false)
  })

  it('invalidates every path and authorization when client application rejects', async () => {
    const state = getFileProcessingValues({
      promisesByPath: { 'a.ts': [], 'b.ts': [] },
      readAuthorizationsByPath: { 'a.ts': true, 'b.ts': true },
      readAuthorizationHashesByPath: {
        'a.ts': getContentHash('old a'),
        'b.ts': getContentHash('old b'),
      },
    })

    const result = await coordinateEditApplication({
      toolName: 'edit_transaction',
      fileProcessingState: state,
      paths: ['a.ts', 'b.ts'],
      apply: async () =>
        [
          { type: 'json', value: { errorMessage: 'client rejected batch' } },
        ] as any,
    })

    expect(result.status).toBe('rejected')
    expect(state.promisesByPath['a.ts']).toBeUndefined()
    expect(state.promisesByPath['b.ts']).toBeUndefined()
    expect(state.failedEditRequiresReadByPath).toEqual({
      'a.ts': true,
      'b.ts': true,
    })
    expect(state.readAuthorizationsByPath).toEqual({})
    expect(state.readAuthorizationHashesByPath).toEqual({})
  })

  it('commits only after positive client output', async () => {
    const state = getFileProcessingValues({
      failedEditRequiresReadByPath: { 'a.ts': true },
    })
    let committed = false

    const result = await coordinateEditApplication({
      toolName: 'str_replace',
      fileProcessingState: state,
      paths: ['a.ts'],
      wholeFileContentByPath: new Map([['a.ts', 'new content']]),
      apply: async () =>
        [
          {
            type: 'json',
            value: {
              kind: 'file_mutation_result',
              version: 1,
              operationId: 'operation',
              outcome: 'applied',
              actions: [
                {
                  actionId: 'operation:0',
                  index: 0,
                  action: 'update',
                  path: 'a.ts',
                  outcome: 'applied',
                  beforeHash: 'before',
                  afterHash: 'after',
                },
              ],
              authorityTier: 'portable_path',
              receiptId: 'operation',
              errors: [],
              freshCapabilities: [],
            },
          },
        ] as any,
      onApplied: () => {
        committed = true
      },
    })

    expect(result.status).toBe('applied')
    expect(committed).toBe(true)
    expect(state.failedEditRequiresReadByPath['a.ts']).toBeUndefined()
    expect(state.readAuthorizationsByPath?.['a.ts']).toBe(true)
    expect(state.readAuthorizationHashesByPath?.['a.ts']).toBe(
      getContentHash('new content'),
    )
  })

  it('drops syntax-rejected prepared state without revoking fresh authorization', async () => {
    const state = getFileProcessingValues({
      promisesByPath: { 'a.ts': [] },
      readAuthorizationsByPath: { 'a.ts': true },
      readAuthorizationHashesByPath: {
        'a.ts': getContentHash('current'),
      },
    })

    const result = await coordinateEditApplication({
      toolName: 'str_replace',
      fileProcessingState: state,
      paths: ['a.ts'],
      rejectionRequiresRead: false,
      apply: async () =>
        [{ type: 'json', value: { errorMessage: 'syntax error' } }] as any,
    })

    expect(result.status).toBe('rejected')
    expect(state.promisesByPath['a.ts']).toBeUndefined()
    expect(state.failedEditRequiresReadByPath['a.ts']).toBeUndefined()
    expect(state.readAuthorizationsByPath?.['a.ts']).toBe(true)
  })

  it('treats an empty client response as unconfirmed and revokes prepared state', async () => {
    const state = getFileProcessingValues({
      promisesByPath: { 'a.ts': [] },
      readAuthorizationsByPath: { 'a.ts': true },
      readAuthorizationHashesByPath: {
        'a.ts': getContentHash('current'),
      },
    })

    const result = await coordinateEditApplication({
      toolName: 'str_replace',
      fileProcessingState: state,
      paths: ['a.ts'],
      apply: async () => [] as any,
    })

    expect(result.status).toBe('rejected')
    expect(result.status === 'rejected' ? result.output : []).toMatchObject([
      { value: { file: 'a.ts', errorMessage: expect.any(String) } },
    ])
    expect(state.failedEditRequiresReadByPath['a.ts']).toBe(true)
    expect(state.readAuthorizationsByPath?.['a.ts']).toBeUndefined()
  })

  it('rejects non-empty output without positive application evidence', async () => {
    const state = getFileProcessingValues({ promisesByPath: { 'a.ts': [] } })
    const result = await coordinateEditApplication({
      toolName: 'str_replace',
      fileProcessingState: state,
      paths: ['a.ts'],
      apply: async () =>
        [{ type: 'json', value: { metadata: 'unknown' } }] as any,
    })

    expect(result.status).toBe('rejected')
    expect(state.failedEditRequiresReadByPath['a.ts']).toBe(true)
  })

  it('rejects ambiguous client messages and preserves the client diagnostic', async () => {
    const state = getFileProcessingValues({ promisesByPath: { 'a.ts': [] } })
    const clientOutput = [
      {
        type: 'json' as const,
        value: { file: 'a.ts', message: 'Queued for approval' },
      },
    ]
    const result = await coordinateEditApplication({
      toolName: 'str_replace',
      fileProcessingState: state,
      paths: ['a.ts'],
      apply: async () => clientOutput as any,
    })

    expect(result.status).toBe('rejected')
    const output = (result.status === 'rejected' ? result.output : []) as any[]
    expect(output[0]).toEqual(clientOutput[0])
    expect(output[1]).toMatchObject({
      type: 'json',
      value: {
        file: 'a.ts',
        errorMessage: expect.stringContaining(
          'no positive edit application evidence',
        ),
      },
    })
    expect(state.failedEditRequiresReadByPath['a.ts']).toBe(true)
  })

  it('treats the exact legacy SDK success envelope as unconfirmed', async () => {
    const state = getFileProcessingValues({ promisesByPath: { 'a.ts': [] } })
    const result = await coordinateEditApplication({
      toolName: 'str_replace',
      fileProcessingState: state,
      paths: ['a.ts'],
      apply: async () =>
        [
          {
            type: 'json',
            value: {
              file: 'a.ts',
              message: 'String replace applied successfully.',
            },
          },
        ] as any,
    })

    expect(result.status).toBe('rejected')
  })
})
