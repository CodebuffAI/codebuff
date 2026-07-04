import type fs from 'fs'

/** File system used for Codebirds SDK.
 *
 * Compatible with `fs.promises` from the `'fs'` module.
 */
export type CodebirdsFileSystem = Pick<
  typeof fs.promises,
  'mkdir' | 'readdir' | 'readFile' | 'stat' | 'unlink' | 'writeFile'
>
