import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import { getInitialAgentState } from '@codebuff/common/types/session-state'

import {
  acquireWorkspacePathLease,
  reconcileInterruptedPathLeases,
  releaseWorkspacePathLease,
} from '../workspace-path-leases'

describe('workspace path leases', () => {
  test('rejects overlapping paths held by a different child', () => {
    const state = getInitialAgentState()
    const projectRoot = path.join('/tmp', 'lease-overlap-test')
    const leaseId = acquireWorkspacePathLease({
      state,
      projectRoot,
      ownerAgentId: 'editor-1',
      paths: ['src/**'],
    })

    expect(() =>
      acquireWorkspacePathLease({
        state,
        projectRoot,
        ownerAgentId: 'editor-2',
        paths: ['src/features/a.ts'],
      }),
    ).toThrow('Workspace path lease conflict')
    releaseWorkspacePathLease(state, leaseId)
  })

  test('allows non-overlapping paths and releases ownership durably', () => {
    const state = getInitialAgentState()
    const projectRoot = path.join('/tmp', 'lease-release-test')
    const first = acquireWorkspacePathLease({
      state,
      projectRoot,
      ownerAgentId: 'editor-1',
      paths: ['src/**'],
    })
    const second = acquireWorkspacePathLease({
      state,
      projectRoot,
      ownerAgentId: 'editor-2',
      paths: ['docs/**'],
    })

    releaseWorkspacePathLease(state, first)
    expect(state.workspacePathLeases?.find((lease) => lease.leaseId === first)).toMatchObject({
      status: 'released',
    })
    expect(() =>
      acquireWorkspacePathLease({
        state,
        projectRoot,
        ownerAgentId: 'editor-3',
        paths: ['src/new.ts'],
      }),
    ).not.toThrow()
    releaseWorkspacePathLease(state, second)
    for (const lease of state.workspacePathLeases ?? []) {
      releaseWorkspacePathLease(state, lease.leaseId)
    }
  })

  test('marks durable active leases as interrupted after process recovery', () => {
    const state = getInitialAgentState()
    state.workspacePathLeases = [
      {
        leaseId: 'missing-runtime-lease',
        ownerAgentId: 'editor-1',
        paths: ['src/a.ts'],
        status: 'active',
        acquiredAt: 1,
        expiresAt: Date.now() + 10_000,
      },
    ]

    reconcileInterruptedPathLeases(state)

    expect(state.workspacePathLeases[0]).toMatchObject({
      status: 'interrupted',
    })
    expect(state.workspacePathLeases[0].releasedAt).toBeNumber()
  })

  test('does not allocate a lease for an empty writable scope', () => {
    const state = getInitialAgentState()
    expect(
      acquireWorkspacePathLease({
        state,
        projectRoot: '/tmp/lease-empty-test',
        ownerAgentId: 'reviewer-1',
        paths: [],
      }),
    ).toBeUndefined()
    expect(state.workspacePathLeases).toBeUndefined()
  })
})
