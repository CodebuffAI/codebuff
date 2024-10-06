import pino from 'pino'
import { env } from '../env.mjs'

export const logger = pino({
  level: 'debug',
  transport:
    env.ENVIRONMENT === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
})
