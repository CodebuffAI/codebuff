import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

// Pinned hashes make the compiled CLI's legacy-wrapper repair deterministic:
// downloaded executable WASM is never loaded unless it matches the exact
// package bytes used by the release build.
type PinnedGrammarAsset = {
  packageName: string
  packageVersion: string
  remoteFile: string
  sha256: string
}

const wasms = (
  remoteFile: string,
  sha256: string,
): PinnedGrammarAsset => ({
  packageName: 'tree-sitter-wasms',
  packageVersion: '0.1.13',
  remoteFile,
  sha256,
})

export const PINNED_GRAMMAR_ASSETS: Readonly<
  Record<string, PinnedGrammarAsset>
> = {
  'tree-sitter-c-sharp.wasm': wasms(
    'tree-sitter-c_sharp.wasm',
    '6266a7e32d68a3459104d994dc848df15d5672b0ea8e86d327274b694f8e6991',
  ),
  'tree-sitter-cpp.wasm': wasms(
    'tree-sitter-cpp.wasm',
    'f6afdf53bfd6de76557bb7edb624a3a3869e14d9a83b78433f93617ecee42527',
  ),
  'tree-sitter-go.wasm': wasms(
    'tree-sitter-go.wasm',
    '9963ca89b616eaf04b08a43bc1fb0f07b85395bec313330851f1f1ead2f755b6',
  ),
  'tree-sitter-java.wasm': wasms(
    'tree-sitter-java.wasm',
    '637aac4415fb39a211a4f4292d63c66b5ce9c32fa2cd35464af4f681d91b9a1f',
  ),
  'tree-sitter-javascript.wasm': wasms(
    'tree-sitter-javascript.wasm',
    '63812b9e275d26851264734868d27a1656bd44a2ef6eb3e85e6b03728c595ab5',
  ),
  'tree-sitter-python.wasm': wasms(
    'tree-sitter-python.wasm',
    '9056d0fb0c337810d019fae350e8167786119da98f0f282aceae7ab89ee8253b',
  ),
  'tree-sitter-ruby.wasm': wasms(
    'tree-sitter-ruby.wasm',
    '93a5022855314cdb45458c7bb026a24a0ebc3a5ff6439e542e881f14dfa13a39',
  ),
  'tree-sitter-rust.wasm': wasms(
    'tree-sitter-rust.wasm',
    '4409921a70d0aa5bec7d1d7ce809a557a8ee1cf6ace901e3ac6a76e62cfea903',
  ),
  'tree-sitter-tsx.wasm': wasms(
    'tree-sitter-tsx.wasm',
    '6aa3b2c70e76f5d48eafef1093e9c4de383e13f2fdde2f4e9b98a378f6a8f1b6',
  ),
  'tree-sitter-typescript.wasm': wasms(
    'tree-sitter-typescript.wasm',
    '8515404dceed38e1ed86aa34b09fcf3379fff1b4ff9dd3967bcd6d1eb5ac3d8f',
  ),
  'tree-sitter-kotlin.wasm': wasms(
    'tree-sitter-kotlin.wasm',
    'b5cb00c8d06ed0f10f1dbe497205b437809d7e87db1f638721a8cfb30e044449',
  ),
  'tree-sitter-php.wasm': wasms(
    'tree-sitter-php.wasm',
    '55bb617b6f01e14bab997861f0b20a2420cf6ba3199ffeb295b9ec398966d8a3',
  ),
  'tree-sitter-swift.wasm': wasms(
    'tree-sitter-swift.wasm',
    '41c4fdb2249a3aa6d87eed0d383081ff09725c2248b4977043a43825980ffcc7',
  ),
  'tree-sitter-gdscript.wasm': {
    packageName: '@vscode/tree-sitter-wasm',
    packageVersion: '0.1.4',
    remoteFile: 'tree-sitter-gdscript.wasm',
    sha256:
      'c4afe77b0c28bc23d0b1710171e5c4623cbd5da4de2ddd87add9ec26e6384f8e',
  },
}

export async function repairGrammarWasm(params: {
  wasmFile: string
  targetDir: string
  fetchImpl?: typeof fetch
}): Promise<string | null> {
  const asset = PINNED_GRAMMAR_ASSETS[params.wasmFile]
  if (!asset || !path.isAbsolute(params.targetDir)) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await (params.fetchImpl ?? fetch)(
      `https://cdn.jsdelivr.net/npm/${asset.packageName}@${asset.packageVersion}/${asset.packageName === 'tree-sitter-wasms' ? 'out' : 'wasm'}/${encodeURIComponent(asset.remoteFile)}`,
      { signal: controller.signal },
    )
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    const actualHash = createHash('sha256').update(bytes).digest('hex')
    if (actualHash !== asset.sha256) return null

    await fs.mkdir(params.targetDir, { recursive: true, mode: 0o700 })
    const targetPath = path.join(params.targetDir, params.wasmFile)
    const tempPath = `${targetPath}.tmp.${process.pid}.${randomUUID()}`
    await fs.writeFile(tempPath, bytes, { mode: 0o600 })
    await fs.rename(tempPath, targetPath)
    return targetPath
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
