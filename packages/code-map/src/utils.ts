export function getDirnameDynamically(): string {
  return new Function('return __dirname')()
}
