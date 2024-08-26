import { initAdmin } from 'shared/init-admin'

initAdmin()

import { getImagePrompt } from 'shared/helpers/openai-utils'

async function main(question: string) {
  console.log('Generating prompt for question:', question)
  await getImagePrompt(question)
}

if (require.main === module) {
  main(process.argv[2]).then(() => process.exit())
}
