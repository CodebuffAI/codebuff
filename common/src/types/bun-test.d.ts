declare module 'bun:test' {
  export const describe: (name: string, fn: () => void) => void
  export const it: (name: string, fn: () => void | Promise<void>) => void
  export const expect: any
  export const beforeEach: (fn: () => void | Promise<void>) => void
  export const mock: any
  export const spyOn: any
}
