import { beforeAll } from 'bun:test'
import dotenv from 'dotenv'
import path from 'path'

beforeAll(() => {
  dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') })
})
