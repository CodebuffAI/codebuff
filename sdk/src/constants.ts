import { env, IS_DEV, IS_TEST, IS_PROD } from '@codebirds/common/env'

export { IS_DEV, IS_TEST, IS_PROD }

export const CODEBIRDS_BINARY = 'codebirds'

export const WEBSITE_URL = env.NEXT_PUBLIC_CODEBIRDS_APP_URL
