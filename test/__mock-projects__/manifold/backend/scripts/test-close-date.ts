import { getCloseDate } from 'shared/helpers/openai-utils'
import { runScript } from './run-script'

if (require.main === module) {
  runScript(async ({}) => {
    await getCloseDate('will biden get 240 votes to win the 2024 election?')
  })
}
