import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  mockModule,
  clearMockedModules,
} from '@codebuff/common/testing/mock-modules'
import {
  spyOn,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  expect,
  it,
  mock,
  beforeAll,
} from 'bun:test'

import { startAgentRun, finishAgentRun, addAgentStep } from '../agent-run'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'

describe('Agent Run Database Functions', () => {
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

  beforeEach(() => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
    }
    agentRuntimeImpl.logger.error = mock(() => {})

    // Setup spies for database operations
    spyOn(db, 'insert').mockReturnValue({
      values: mock(() => Promise.resolve({ id: 'test-run-id' })),
    } as any)
    spyOn(db, 'update').mockReturnValue({
      set: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    } as any)
  })

  afterEach(() => {
    mock.restore()
  })

  // Mock drizzle-orm module
  beforeAll(async () => {
    await mockModule('drizzle-orm', () => ({
      eq: mock(() => 'eq-result'),
    }))
  })

  afterAll(() => {
    clearMockedModules()
  })

  describe('startAgentRun', () => {
    it('should create a new agent run with generated ID when runId not provided', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)

      // Mock crypto.randomUUID
      spyOn(crypto, 'randomUUID').mockReturnValue('generated-uuid')

      const result = await startAgentRun({
        ...agentRuntimeImpl,
        userId: 'user-123',
        agentId: 'test-agent',
        ancestorRunIds: ['parent-run-1', 'parent-run-2'],
      })

      expect(result).toBe('generated-uuid')
      expect(db.insert).toHaveBeenCalledWith(schema.agentRun)
      expect(mockValues).toHaveBeenCalledWith({
        id: 'generated-uuid',
        user_id: 'user-123',
        agent_id: 'test-agent',
        ancestor_run_ids: ['parent-run-1', 'parent-run-2'],
        status: 'running',
        created_at: expect.any(Date),
      })
    })

    it('should use provided runId when specified', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)

      const result = await startAgentRun({
        ...agentRuntimeImpl,
        runId: 'custom-run-id',
        userId: 'user-123',
        agentId: 'test-agent',
        ancestorRunIds: [],
      })

      expect(result).toBe('custom-run-id')
      expect(mockValues).toHaveBeenCalledWith({
        id: 'custom-run-id',
        user_id: 'user-123',
        agent_id: 'test-agent',
        ancestor_run_ids: null, // Empty array should be converted to null
        status: 'running',
        created_at: expect.any(Date),
      })
    })

    it('should handle missing userId gracefully', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('generated-uuid')

      await startAgentRun({
        ...agentRuntimeImpl,
        agentId: 'test-agent',
        ancestorRunIds: [],
      })

      expect(mockValues).toHaveBeenCalledWith({
        id: 'generated-uuid',
        user_id: undefined,
        agent_id: 'test-agent',
        ancestor_run_ids: null,
        status: 'running',
        created_at: expect.any(Date),
      })
    })

    it('should convert empty ancestorRunIds to null', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('generated-uuid')

      await startAgentRun({
        ...agentRuntimeImpl,
        agentId: 'test-agent',
        ancestorRunIds: [],
      })

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          ancestor_run_ids: null,
        }),
      )
    })

    it('should preserve non-empty ancestorRunIds array', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('generated-uuid')

      await startAgentRun({
        ...agentRuntimeImpl,
        agentId: 'test-agent',
        ancestorRunIds: ['root-run', 'parent-run'],
      })

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          ancestor_run_ids: ['root-run', 'parent-run'],
        }),
      )
    })

    it('should handle database errors and log them', async () => {
      const mockError = new Error('Database connection failed')
      const mockValues = mock(() => Promise.reject(mockError))
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('generated-uuid')

      expect(
        startAgentRun({
          ...agentRuntimeImpl,
          agentId: 'test-agent',
          ancestorRunIds: [],
        }),
      ).rejects.toThrow('Database connection failed')

      expect(agentRuntimeImpl.logger.error).toHaveBeenCalledWith(
        {
          error: mockError,
          runId: undefined,
          userId: undefined,
          agentId: 'test-agent',
          ancestorRunIds: [],
        },
        'Failed to start agent run',
      )
    })
  })

  describe('finishAgentRun', () => {
    it('should update agent run with completion data', async () => {
      const mockWhere = mock(() => Promise.resolve())
      const mockSet = mock(() => ({ where: mockWhere }))
      spyOn(db, 'update').mockReturnValue({ set: mockSet } as any)

      await finishAgentRun({
        ...agentRuntimeImpl,
        userId: undefined,
        runId: 'test-run-id',
        status: 'completed',
        totalSteps: 5,
        directCredits: 150.5,
        totalCredits: 300.75,
      })

      expect(db.update).toHaveBeenCalledWith(schema.agentRun)
      expect(mockSet).toHaveBeenCalledWith({
        status: 'completed',
        completed_at: expect.any(Date),
        total_steps: 5,
        direct_credits: '150.5', // Should be converted to string
        total_credits: '300.75', // Should be converted to string
        error_message: undefined,
      })
      expect(mockWhere).toHaveBeenCalledWith('eq-result')
    })

    it('should handle failed status with error message', async () => {
      const mockWhere = mock(() => Promise.resolve())
      const mockSet = mock(() => ({ where: mockWhere }))
      spyOn(db, 'update').mockReturnValue({ set: mockSet } as any)

      await finishAgentRun({
        ...agentRuntimeImpl,
        userId: undefined,
        runId: 'test-run-id',
        status: 'failed',
        totalSteps: 3,
        directCredits: 75.25,
        totalCredits: 125.5,
        errorMessage: 'Agent execution failed',
      })

      expect(mockSet).toHaveBeenCalledWith({
        status: 'failed',
        completed_at: expect.any(Date),
        total_steps: 3,
        direct_credits: '75.25',
        total_credits: '125.5',
        error_message: 'Agent execution failed',
      })
    })

    it('should handle cancelled status', async () => {
      const mockSet = mock(() => ({ where: mock(() => Promise.resolve()) }))
      const mockWhere = mock(() => Promise.resolve())
      spyOn(db, 'update').mockReturnValue({ set: mockSet } as any)
      mockSet.mockReturnValue({ where: mockWhere })

      await finishAgentRun({
        ...agentRuntimeImpl,
        userId: undefined,
        runId: 'test-run-id',
        status: 'cancelled',
        totalSteps: 2,
        directCredits: 50,
        totalCredits: 100,
      })

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
        }),
      )
    })

    it('should handle database errors and log them', async () => {
      const mockError = new Error('Update failed')
      const mockSet = mock(() => ({
        where: mock(() => Promise.reject(mockError)),
      }))
      spyOn(db, 'update').mockReturnValue({ set: mockSet } as any)

      expect(
        finishAgentRun({
          ...agentRuntimeImpl,
          userId: undefined,
          runId: 'test-run-id',
          status: 'completed',
          totalSteps: 5,
          directCredits: 150,
          totalCredits: 300,
        }),
      ).rejects.toThrow('Update failed')

      expect(agentRuntimeImpl.logger.error).toHaveBeenCalledWith(
        {
          error: mockError,
          runId: 'test-run-id',
          status: 'completed',
        },
        'Failed to finish agent run',
      )
    })
  })

  describe('addAgentStep', () => {
    it('should create a new agent step with all optional fields', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      const startTime = new Date('2023-01-01T10:00:00Z')

      const result = await addAgentStep({
        ...agentRuntimeImpl,
        userId: undefined,
        agentRunId: 'run-123',
        stepNumber: 1,
        credits: 25.5,
        childRunIds: ['child-1', 'child-2'],
        messageId: 'msg-456',
        status: 'completed',
        startTime,
      })

      expect(result).toBe('step-uuid')
      expect(db.insert).toHaveBeenCalledWith(schema.agentStep)
      expect(mockValues).toHaveBeenCalledWith({
        id: 'step-uuid',
        agent_run_id: 'run-123',
        step_number: 1,
        status: 'completed',
        credits: '25.5', // Should be converted to string
        child_run_ids: ['child-1', 'child-2'],
        message_id: 'msg-456',
        error_message: undefined,
        created_at: startTime,
        completed_at: expect.any(Date),
      })
    })

    it('should handle minimal required fields only', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      const startTime = new Date('2023-01-01T10:00:00Z')

      await addAgentStep({
        ...agentRuntimeImpl,
        userId: undefined,
        agentRunId: 'run-123',
        stepNumber: 2,
        startTime,
        messageId: null,
      })

      expect(mockValues).toHaveBeenCalledWith({
        id: 'step-uuid',
        agent_run_id: 'run-123',
        step_number: 2,
        status: 'completed', // Default status
        credits: undefined,
        child_run_ids: undefined,
        message_id: null,
        error_message: undefined,
        created_at: startTime,
        completed_at: expect.any(Date),
      })
    })

    it('should handle skipped status with error message', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      const startTime = new Date('2023-01-01T10:00:00Z')

      await addAgentStep({
        ...agentRuntimeImpl,
        userId: undefined,
        agentRunId: 'run-123',
        stepNumber: 3,
        status: 'skipped',
        errorMessage: 'Step failed validation',
        startTime,
        messageId: null,
      })

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'skipped',
          error_message: 'Step failed validation',
        }),
      )
    })

    it('should handle running status', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      const startTime = new Date('2023-01-01T10:00:00Z')

      await addAgentStep({
        ...agentRuntimeImpl,
        userId: undefined,
        agentRunId: 'run-123',
        stepNumber: 4,
        status: 'running',
        startTime,
        messageId: null,
      })

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
        }),
      )
    })

    it('should handle credits as number and convert to string', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      const startTime = new Date('2023-01-01T10:00:00Z')

      await addAgentStep({
        ...agentRuntimeImpl,
        userId: undefined,
        agentRunId: 'run-123',
        stepNumber: 5,
        credits: 0, // Zero credits
        startTime,
        messageId: null,
      })

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          credits: '0',
        }),
      )
    })

    it('should handle database errors and log them', async () => {
      const mockError = new Error('Insert failed')
      const mockValues = mock(() => Promise.reject(mockError))
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      const startTime = new Date('2023-01-01T10:00:00Z')

      expect(
        addAgentStep({
          ...agentRuntimeImpl,
          userId: undefined,
          agentRunId: 'run-123',
          stepNumber: 6,
          startTime,
          messageId: null,
        }),
      ).rejects.toThrow('Insert failed')

      expect(agentRuntimeImpl.logger.error).toHaveBeenCalledWith(
        {
          error: mockError,
          agentRunId: 'run-123',
          stepNumber: 6,
        },
        'Failed to add agent step',
      )
    })
  })

  describe('Data Type Conversions', () => {
    it('should properly convert numeric credits to strings for database storage', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      await addAgentStep({
        ...agentRuntimeImpl,
        userId: undefined,
        agentRunId: 'run-123',
        stepNumber: 1,
        credits: 123.456789, // High precision number
        startTime: new Date(),
        messageId: null,
      })

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          credits: '123.456789', // Should preserve precision as string
        }),
      )
    })

    it('should handle timestamp conversion properly', async () => {
      const mockValues = mock(() => Promise.resolve())
      spyOn(db, 'insert').mockReturnValue({ values: mockValues } as any)
      spyOn(crypto, 'randomUUID').mockReturnValue('step-uuid')

      const specificStartTime = new Date('2023-01-01T10:30:45.123Z')

      await addAgentStep({
        ...agentRuntimeImpl,
        userId: undefined,
        agentRunId: 'run-123',
        stepNumber: 1,
        startTime: specificStartTime,
        messageId: null,
      })

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          created_at: specificStartTime,
          completed_at: expect.any(Date),
        }),
      )
    })
  })
})
