import type fs from 'fs'

/** File system used for Codebuff SDK.
 *
 * Compatible with the `'fs'` module
 */
export type CodebuffFileSystem = Pick<
  typeof fs,
  | 'existsSync'
  | 'mkdirSync'
  | 'readdirSync'
  | 'readFileSync'
  | 'statSync'
  | 'writeFileSync'
> & { promises: Pick<typeof fs.promises, 'readdir'> }
