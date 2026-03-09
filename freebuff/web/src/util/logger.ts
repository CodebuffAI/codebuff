import pino from 'pino'

const pinoLogger = pino({
  level: 'debug',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
})

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

export const logger: Record<LogLevel, pino.LogFn> = Object.fromEntries(
  loggingLevels.map((level) => [
    level,
    (data: unknown, msg?: string, ...args: unknown[]) =>
      pinoLogger[level === 'fatal' ? 'fatal' : level](data, msg, ...args),
  ]),
) as Record<LogLevel, pino.LogFn>
