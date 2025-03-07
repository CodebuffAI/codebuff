import { BrowserRunner } from '../browser-runner'
import { BrowserAction } from 'common/browser-actions'

// Add your tests here
describe('BrowserRunner', () => {
  let runner: BrowserRunner

  beforeEach(() => {
    runner = new BrowserRunner()
  })

  afterEach(async () => {
    await runner.shutdown()
  })

  // Add test cases...
})
