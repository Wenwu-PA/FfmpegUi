import { mkdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type { Page } from '@playwright/test'

export async function captureScreenshot(page: Page, filename: string) {
  const output = path.join(process.cwd(), 'docs', 'screenshots', filename)
  mkdirSync(path.dirname(output), { recursive: true })
  const png = await page.screenshot({ animations: 'disabled' })
  await sharp(png).resize({ width: 1280, height: 720, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(output)
  const { size } = await sharp(output).metadata()
  if (size && size > 300_000) throw new Error(`${filename} exceeds the 300 KB screenshot limit.`)
}
