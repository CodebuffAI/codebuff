export const isZedIDE = (): boolean => {
  return process.env.ZED_TERM === 'true'
}
