import { beforeAll } from 'bun:test'
import dotenv from 'dotenv'
import path from 'path'
import { env } from './env.mjs'

beforeAll(() => {
  dotenv.config({
    processEnv: env,
  })
})
