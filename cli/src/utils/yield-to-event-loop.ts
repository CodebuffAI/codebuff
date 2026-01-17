/**
 * Yield to the event loop so pending React state updates and microtasks can flush
 * before continuing. Useful after enqueuing UI changes that should render
 * before the next step of an async flow.
 */
export const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
