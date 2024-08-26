import { log } from 'shared/utils'

const debouncer: {
  [key: string]: {
    timeout: NodeJS.Timeout
    func: () => Promise<void>
    wait: number
  }
} = {}

export const debounce = (
  key: string,
  func: () => Promise<void>,
  wait: number
) => {
  if (debouncer[key]) {
    clearTimeout(debouncer[key].timeout)
  }

  debouncer[key] = {
    timeout: setTimeout(async () => {
      await func().catch((err) =>
        log.error('Error in debounced function', { err, key, wait })
      )
      delete debouncer[key]
    }, wait),
    func,
    wait,
  }
}
