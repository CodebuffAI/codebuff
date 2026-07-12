import { describe, test, expect, beforeEach, mock } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { useChatInput } from '../use-chat-input'

import type { InputValue } from '../../types/store'
import type { AgentMode } from '../../utils/constants'

// Minimal renderHook shim using SSR. The hook only uses React hooks and
// zustand, no DOM APIs, so server-side rendering is sufficient to invoke it.
//
// Note: Zustand's useSyncExternalStore returns getServerSnapshot() during SSR,
// which snapshots the initial store state. Mutating the store via setState
// before render is NOT visible during SSR, so inputMode-dependent tests can't
// rely on store mutation. The isCompactHeight and isNarrowWidth props exercise
// the same estimatedToggleWidth=0 branch that bash mode would trigger.
const renderHook = <T, P>(
  hook: (props: P) => T,
  initialProps: P,
): { result: { current: T }; rerender: (props: P) => void } => {
  let result: T
  let props = initialProps

  const Comp = () => {
    result = hook(props)
    return null as unknown as React.ReactElement
  }

  const render = () => {
    void renderToStaticMarkup(React.createElement(Comp as React.FC))
  }
  render()

  return {
    result: {
      get current() {
        return result!
      },
    },
    rerender: (nextProps: P) => {
      props = nextProps
      render()
    },
  }
}

const baseOptions = {
  setAgentMode: mock((mode: AgentMode) => {}),
  setInputValue: mock((value: InputValue) => {}),
  separatorWidth: 80,
  initialPrompt: null as string | null,
  onSubmitPrompt: mock((_content: string, _mode: AgentMode) => {}),
  isCompactHeight: false,
  isNarrowWidth: false,
}

describe('useChatInput', () => {
  beforeEach(() => {
    baseOptions.setAgentMode.mockClear()
    baseOptions.setInputValue.mockClear()
    baseOptions.onSubmitPrompt.mockClear()
  })

  test('handleBuildFast sets EXECUTE_PLAN mode and fills "Build it!"', () => {
    const { result } = renderHook(useChatInput, {
      ...baseOptions,
      agentMode: 'DEFAULT' as AgentMode,
    })

    result.current.handleBuildFast()

    expect(baseOptions.setAgentMode).toHaveBeenCalledWith('EXECUTE_PLAN')
    const setCalls = baseOptions.setInputValue.mock.calls as Array<[InputValue]>
    // The first call sets the "Build it!" text
    expect(setCalls[0][0]).toMatchObject({
      text: 'Build it!',
      cursorPosition: 9,
      lastEditDueToNav: true,
    })
  })

  test('handleBuildFast submits the prompt and clears input asynchronously', async () => {
    const { result } = renderHook(useChatInput, {
      ...baseOptions,
      agentMode: 'DEFAULT' as AgentMode,
    })

    result.current.handleBuildFast()

    // Wait for the setTimeout(0) to fire
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(baseOptions.onSubmitPrompt).toHaveBeenCalledWith(
      'Build it!',
      'EXECUTE_PLAN',
    )

    const setCalls = baseOptions.setInputValue.mock.calls as Array<[InputValue]>
    // The last call clears the input
    const lastCall = setCalls[setCalls.length - 1][0]
    expect(lastCall).toMatchObject({
      text: '',
      cursorPosition: 0,
      lastEditDueToNav: false,
    })
  })

  test('computes non-zero toggle width in default mode on normal width', () => {
    const { result } = renderHook(useChatInput, {
      ...baseOptions,
      agentMode: 'DEFAULT' as AgentMode,
      separatorWidth: 80,
    })

    // estimatedToggleWidth = stringWidth(`< DEFAULT`) + 6 = 9 + 6 = 15
    // inputWidth = max(1, 80 - 2 - 15) = 63
    expect(result.current.inputWidth).toBe(63)
  })

  test('hides toggle width when isCompactHeight is true', () => {
    // isCompactHeight exercises the same estimatedToggleWidth=0 branch as
    // bash mode (inputMode !== 'default'), without needing store mutation
    // which is invisible during SSR via useSyncExternalStore.
    const { result } = renderHook(useChatInput, {
      ...baseOptions,
      agentMode: 'DEFAULT' as AgentMode,
      separatorWidth: 80,
      isCompactHeight: true,
    })

    // Toggle width = 0, so inputWidth = 80 - 2 = 78
    expect(result.current.inputWidth).toBe(78)
  })

  test('hides toggle width when isNarrowWidth is true', () => {
    const { result } = renderHook(useChatInput, {
      ...baseOptions,
      agentMode: 'DEFAULT' as AgentMode,
      separatorWidth: 80,
      isNarrowWidth: true,
    })

    // Toggle width = 0, so inputWidth = 80 - 2 = 78
    expect(result.current.inputWidth).toBe(78)
  })

  test('clamps inputWidth to at least 1 for tiny separators', () => {
    const { result } = renderHook(useChatInput, {
      ...baseOptions,
      agentMode: 'DEFAULT' as AgentMode,
      separatorWidth: 1,
    })

    expect(result.current.inputWidth).toBeGreaterThanOrEqual(1)
  })
})
