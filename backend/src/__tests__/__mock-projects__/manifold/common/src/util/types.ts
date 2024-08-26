export function assertUnreachable(x: never, message?: string): never {
  if (message) throw new Error(message)
  throw new Error(
    `Expected unreachable value, instead got: ${JSON.stringify(x)}`
  )
}
