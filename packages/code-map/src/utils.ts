export function getDirnameDynamically(): string | undefined {
  return new Function(
    `try { return __dirname; } catch (e) { return undefined; }`,
  )()
}
