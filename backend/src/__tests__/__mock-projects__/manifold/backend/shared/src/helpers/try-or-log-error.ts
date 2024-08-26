import { log } from 'shared/utils'

export const tryOrLogError = async <T>(task: Promise<T>) => {
  try {
    return await task
  } catch (e) {
    log.error(e)
    return null
  }
}
