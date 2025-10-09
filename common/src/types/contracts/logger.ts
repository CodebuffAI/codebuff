export type LoggerFn = (
  data: unknown,
  msg?: string,
  ...args: unknown[]
) => unknown

export type Logger = {
  debug: LoggerFn
  info: LoggerFn
  warn: LoggerFn
  error: LoggerFn
}
