import { env, IS_DEV, IS_TEST, IS_PROD } from '@codebuff/common/env'

export { IS_DEV, IS_TEST, IS_PROD }

export const CODEBUFF_BINARY = 'codebuff'

export const WEBSITE_URL = env.NEXT_PUBLIC_CODEBUFF_APP_URL
