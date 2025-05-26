import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { homedir } from 'os'

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif']

function resolvePath(p: string): string {
  if (p.startsWith('~')) return path.join(homedir(), p.slice(1))
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
}

export async function extractImagesFromInput(input: string): Promise<{ text: string; images: string[] }> {
  const tokens = input.split(/\s+/)
  const imagePaths: string[] = []
  const textTokens: string[] = []

  for (const token of tokens) {
    const resolved = resolvePath(token.replace(/^['\"]|['\"]$/g, ''))
    if (IMAGE_EXTENSIONS.some((ext) => resolved.toLowerCase().endsWith(ext)) && existsSync(resolved)) {
      imagePaths.push(resolved)
    } else {
      textTokens.push(token)
    }
  }

  const images: string[] = []
  for (const imgPath of imagePaths) {
    try {
      // @ts-ignore - optional dependency
      const sharp = await import('sharp')
      const buffer = await sharp.default(imgPath).png().toBuffer()
      images.push(buffer.toString('base64'))
    } catch {
      const data = readFileSync(imgPath)
      images.push(data.toString('base64'))
    }
  }

  return { text: textTokens.join(' ').trim(), images }
}
