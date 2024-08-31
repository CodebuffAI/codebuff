import { initAdmin } from 'shared/init-admin'
initAdmin()

import { testBackendFunction } from 'shared/test-backend-function'

async function testBackendFunctionScript() {
  await testBackendFunction()
}

if (require.main === module)
  testBackendFunctionScript().then(() => process.exit())
