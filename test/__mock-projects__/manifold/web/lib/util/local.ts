export interface Store {
  getItem: (key: string) => string | null
  setItem: (key: string, val: string) => void
  removeItem: (key: string) => void
}

function getStorageProxy(store: Storage): Store | undefined {
  try {
    store.setItem('test', '')
    store.getItem('test')
    store.removeItem('test')
  } catch (e) {
    console.warn(e)
    return undefined
  }
  return {
    getItem: (key: string) => store.getItem(key) ?? null,
    setItem: (key: string, value: string) => {
      try {
        store.setItem(key, value)
      } catch (e) {
        store.clear()
        // try again
        store.setItem(key, value)
      }
    },
    removeItem: (key: string) => store.removeItem(key),
  }
}

export let safeLocalStorage: Store | undefined
export let safeSessionStorage: Store | undefined

try {
  safeLocalStorage = getStorageProxy(localStorage)
} catch {}

try {
  safeSessionStorage = getStorageProxy(sessionStorage)
} catch {}

export function newInMemoryStore(): Store {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key],
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
  }
}
