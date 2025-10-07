export type LoggerFunction = (
  data: unknown,
  msg?: string,
  ...args: unknown[]
) => unknown

export type Logger = {
  debug: LoggerFunction
  info: LoggerFunction
  warn: LoggerFunction
  error: LoggerFunction
}
